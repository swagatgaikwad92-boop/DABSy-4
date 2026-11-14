# DABSy v12.0.0 — Experience, Interaction, Study Intelligence and Visual Design upgrade

Base: v11.2 (settings fix). No rewrite: the architecture (flat-file, no-build PWA with lazy modules) is unchanged; every change is either a new
file or a targeted edit. 14 new files, 17 edited. Nothing was removed.

## 1. What was found first (audit)

| Area | Where it lives | Finding |
|---|---|---|
| Study Mode "forgets Study Space", loses normal DABSy | `app.js` `processUtterance` | While the Study Block was on, **every** message was sent straight to the explainer, before reminders, planning, apps, "open Study Space", chat. Root cause of Part 7. |
| Random maths symbols | `ai-engine.js` + `study-engine.js` | Prompts told the model "no markdown symbols" and Study answers were requested **as JSON**. JSON escaping turns `\frac` into a form-feed, `\times` into a tab, `\beta` into a backspace. There was no maths renderer at all. |
| Widgets | `widget-engine.js` | Six fixed slots; widgets could only swap slots; no size or colour. |
| Rest of Day | `dayplan-engine.js` | Auto-scheduler over an ordered queue: times were computed, never stored, so a time could not be edited. Reorder was arrow buttons only. |
| Live Talk | `live-talk.js` | State machine was sound. The visual was a ring; the "listening" label was shown before the microphone had actually started. |
| Recommendations | `research-service.js`, `resource-cards.js` | `find(goal)` had no way to take preferences. |
| Chat input | `index.html` | `<input type=text>` (cannot grow). |
| Timer | `study-session.js` | Timing is wall-clock based (accurate). Only the look was a tall card. |
| Light theme | `soda.css` + `banana.css` | Banana-yellow tokens (`--bm-milk #fff4c8`) used on cards in **both** themes. |
| Working and left alone | wall-clock timer logic, calendar/tasks, butler, onboarding, wardrobe, Study Space bridge, notifications, offline shell | Not modified (except the edits listed below). |

## 2. What changed, by part

**1 Daytime design — `day.css` (new).** "Morning Paper": muted warm ivory `#ebe7dd`, desaturated sky `#3f6a8c`, soft sage, gentle lavender, warm neutral. No banana yellow,
no harsh white, low-saturation borders, soft layered light (sun glow, sky mist behind DABSy, sage at the bottom, a whisper of static paper grain). The banana card tokens are
redefined per theme. Night is **not** an inversion: "Midnight Study" — deep midnight-blue glass, periwinkle accent, warm lamp-light, faint stars. Contrast checked (see §4).
`theme-color`/manifest updated.

**2 Widgets — `widget-engine.js` (edited), `widgets2.css` (new).** Free positioning (stored as screen fractions, clamped on screen), drag anywhere without entering a mode, momentum
glide with a short settle, size 75–160 % (corner handle in customise mode, − / + in the quick tools, arrow keys), 7 colour presets each defined for day and night plus a custom colour
picker with automatic readable ink. Press-and-hold opens the small tools card. Saved in `widgets_v3`; a saved v2 slot arrangement is converted once. Tapping a moved widget works as before.

**3 Liquid Glass — `glass.css`, `glass-engine.js` (new).** Environmental blur + saturation, tinted translucent fill, specular sheen that follows the touch point, illuminated edge ring,
inner highlight and a faint lower reflection, soft shadow. Press sinks the surface a little; release settles with one small overshoot (CSS `linear()` spring, bezier fallback).
Passive delegated listeners only (nothing is prevented). Cheaper tier under `lite-gfx`, none under reduced motion/transparency.

**4 Rest of Day — `dayplan-engine.js`, `dayplan.css` (edited), `time-picker.js`, `timepicker.css` (new).**
* Drag the ⋮⋮ grip to move an activity (drop line shows where; autoscroll at the sheet edges; rows glide to their new places). Arrow keys on the grip do the same.
* Press and hold a time (≈0.45 s, with a visible hold ring and a small haptic) → a DABSy clock dial: tap/drag the hour, it moves on to minutes; AM/PM; ±5/±15 chips; keyboard.
* The scheduler now supports **placed** activities (`pin`): they keep their exact time, everything else flows around them. Overlap with a calendar event/task or another placed
  activity is **flagged on the row, in a banner, and by a toast** naming what it overlaps, with a one-tap "Move to <nearest free time>". Times earlier than now are refused. "Let DABSy
  choose" returns an activity to automatic placement. Other activities are never deleted or resized by a move.

**5 Live Talk — `live-talk.js` (edited), `livetalk.css` (new).** DABSy's own character is the centrepiece. Three distinct states: **Listening** (ripples + attentive eyes + "Mic on" badge, only while
the browser's recognition has *actually started* — before that it says "Getting ready…"), **Thinking** (mic badge "Mic off", ripples gone, character sways, eyes glance, dots), **Speaking** (mic off,
character beats on each spoken word via the TTS word events, Stop button). The card expands to a near-full-screen conversation view (character, transcript, controls kept) and collapses again.
Tap the character while it speaks to interrupt. The old generic circle is gone. See "character asset" in §5.

**6 Study intelligence — `ai-engine.js`, `study-engine.js` (rewritten), `math-render.js`, `math.css`, `vendor/katex/` (new).**
KaTeX 0.16.47 + mhchem (MIT, vendored, loaded only when a formula appears, precached offline). Answers are plain text with LaTeX (no JSON), rendered as real fractions, powers, roots, vectors,
Greek, units, chemistry (`\ce{}`), matrices. A formula KaTeX cannot parse is shown as its own source, never as garbage. Control characters from escaped JSON are repaired for the other paths.
The tutor prompt enforces: exact given numbers, ask when data is missing, vector vs scalar, units/dimension checks, Given → Find → Concept (why it applies) → Formula → Substitute → Solve →
Check → Answer, honest uncertainty, a different angle when the student is confused. **Recheck** (independent re-solve → "Verified:" or "Correction:"), **Explain differently**, follow-ups with history.
Replies are read aloud block by block with formulas spoken as words ("v squared equals u squared plus 2 a s"). Raw LaTeX is no longer spoken anywhere.

**7 Study Space continuity — `app.js`.** The Study Block now explains *study questions only* (`study.classify`). Reminders, planning, apps, "open Study Space", small talk continue through the normal pipeline.
Inside the explanation surface a follow-up that isn't a study question closes it and goes to normal DABSy. "Find study material" and Study Space remain one tap away.

**8 Material preferences — `research-service.js`, `resource-cards.js`, `agent-engine.js`, `cards.css`.** A conversational box is the **last element** of the recommendation card ("Not quite right? Tell me what you
prefer"), with quick chips, loading skeletons, an honest empty state ("Nothing matched that…", with a way back to the earlier results). Preferences are parsed locally from natural language (wants and
avoids: *visual, animated, video, beginner, short, practice, PDF, "avoid lengthy PDFs", "under 10 min"…*), change the actual search query, re-rank and filter real candidates and are passed to the AI re-ranker.
Nothing is added that a provider did not return; each item says why it matches.

**9 Chat input — `index.html`, `app.js`, `chatbox-engine.js`, `chatbox.css`.** `<textarea>`: grows with the text up to five lines then scrolls inside; Send button appears when there is text and stays at the
bottom-right; desktop Enter sends / Shift+Enter newline; touch Enter = newline, Send button sends. The reply card follows the real dock height (no jump). Uses `field-sizing: content` with a tested JS fallback.

**10 Study timer — `study-session.js`, `timer.css`.** Compact floating glass pill: progress ring, large time, pause/resume always visible. Tap to open skip/ask/plan/end. Drag it; it snaps left/centre/right and remembers.
Moves to the top while you type. Timing logic untouched (wall-clock), verified across expand/collapse and a simulated 5 s UI sleep.

**11 Consistency.** One token layer (`day.css`) and one material layer (`glass.css`) loaded last; lazy feature styles are now inserted *before* them (`dabsy-config.js`) so they always win. Character, layouts and
navigation unchanged. Offline cache (`sw.js`) updated to v12.0.0 with every new file.

## 3. Files
New: `chatbox-engine.js chatbox.css study.css time-picker.js timepicker.css livetalk.css widgets2.css timer.css day.css glass.css glass-engine.js math-render.js math.css vendor/katex/* assets/live/README.md tests/*`
Edited: `index.html app.js ai-engine.js study-engine.js voice-engine.js live-talk.js widget-engine.js dayplan-engine.js dayplan.css cards.css research-service.js resource-cards.js agent-engine.js study-session.js dabsy-config.js theme-engine.js manifest.json sw.js`

## 4. Testing report (136 automated checks, all passing; headless Chromium 153, touch-emulated 390×800, AI/search/weather mocked)

| # | Requirement | Suite | Result |
|---|---|---|---|
| 1 | Day and night themes | `t_sweep` (light/dark × classic/magic: boot, chat, chooser, notifications, no console errors); contrast computed; screenshots reviewed | 4/4; text ≥ 4.5:1 (largest miss fixed) |
| 2 | Widget drag + colour | `t_widgets`: non-overlapping defaults, free drag, others unmoved, persistence across reload, fling momentum, edge clamping, hold → tools, preset + custom colour, size ±, corner resize, tap still works, v2 migration | 20/20 |
| 3 | Glass interactions | reviewed in screenshots; press/sheen verified to not break taps (all suites run with the engine active); **sheen/press feel not measurable headless** | see limitations |
| 4 | Schedule rearrangement | `t_schedule`: drag with drop indicator, chronological order, others preserved, keyboard move | 25/25 |
| 5 | Hold-to-edit time | `t_schedule`: no picker on a short press, opens on hold, dial hour→minute, AM/PM, chips, set, refuse past time, conflict flag + toast + banner + one-tap fix, "Let DABSy choose" | (in the 25) |
| 6 | Live Talk states | `t_livetalk`: mic not claimed before start, listening/thinking/speaking distinct, mic off while thinking/speaking, beat, expand/collapse, tap-to-interrupt, End | 18/18 |
| 7 | Equation rendering | `t_study`: fractions, vectors, units, `\ce`, quadratic formula; no raw `$`/`\frac`; no control characters; 6 repeated runs (found and fixed a loader race) | 17/17 |
| 8 | Study Mode accuracy | **Not provable offline.** Verified: prompt content sent, exact student text sent, plain text (not JSON), Recheck sends an independent re-solve, history + confusion flag on follow-ups | 17/17 (plumbing only) |
| 9 | Study Space continuity | `t_study`: classifier on 13 phrases, "open study space" and non-study messages work while the Study Block is on, no tutor call made for them | included |
| 10 | Preference recommendations | `t_prefs`: wants/avoids parsed, animated-beginner video ranks first, "no videos", impossible preference → honest empty result, card order, loading + empty + back | 15/15 |
| 11 | Adaptive chatbox | `t_chatbox` (touch and desktop) + `t_fallback` (no `field-sizing`) | 18/18 + 3/3 |
| 12 | Study timer | `t_timer`: compact pill, pause/resume, no jump on resume, expand/collapse, wall-clock after sleep, drag/snap/persist, moves while typing, cleanup | 16/16 |
| — | Features don't break each other | every suite re-run after every later change; final full run below | all pass |

## 5. Known limitations (please read)
* **Study accuracy depends on the AI model behind your proxy.** The prompt, structure, exact-number handling, formatting and the Recheck pass make mistakes less likely and easier to catch; they cannot guarantee a correct result. I had no live model, so answers were mocked. If your Worker's per-request token cap is low, long worked solutions may be cut — check `backend/worker.js`.
* **Character asset.** The picture you sent has a solid black background (no transparency), so it was *not* shipped as the Live Talk image (it would show as a black box). Live Talk uses DABSy's existing layered artwork (body, eyes, bow, halo) so nothing is redrawn. Put a transparent `dabsy-character.png` or `.webp` in `assets/live/` and it is used automatically (`assets/live/README.md`).
* **Live Talk** was tested by driving the real events; I could not test a physical microphone, the browser's speech recognition or the Android voice. Recognition needs a browser that supports it (and often internet). **Voice barge-in is not offered**: listening while DABSy talks makes it hear itself; interruption is by tapping the character. Replies arrive when the model finishes (not streamed).
* **Not tested on a real Android phone** and no frame-rate measurement on mid-range hardware. Cheaper settings exist (`lite-gfx`, reduced motion/transparency) but the glass blur cost is unmeasured. The touch "feel" (press sink, settle, momentum) was verified mechanically, not by hand.
* **Schedule:** dragging works within a day (use the clock to move an activity to another day of a week plan); a task split in parts moves as a whole; a moved/timed activity stays where you put it until you choose "Let DABSy choose".
* **Study/other classifier** is rule-based; an unusual message can be routed the wrong way. If so, "Explain …" always goes to Study, and the follow-up box inside the explanation hands non-study text back to normal DABSy.
* **Recommendations:** preferences are understood in English keywords (not Hindi/Marathi); results depend on the live providers (Piped, Wikipedia, Internet Archive) and were tested with mocked providers. If nothing fits, it says so.
* Study read-aloud now honours the "speak replies" setting (before, it spoke even when muted).
* The morning-briefing popup can appear over the plan editor (existing behaviour, unchanged).
* The Magic World wallpaper form and the wardrobe outfits were not visually re-reviewed against the new palette.
* KaTeX adds ≈640 KB to the offline cache; it is only loaded on first formula.

## 6. Deploy
1. Replace the contents of your repo/site folder with this project (keep your own `backend/` and any private config).
2. Serve over https (GitHub Pages works as before: Settings → Pages → `main` / root).
3. The service worker cache is now `dabsy-v12.0.0`; users get the update on the next load (network-first). On a phone installed as a PWA, close and reopen once; if an old look sticks, clear site data once.
4. No new keys, no new backend routes, no build step. `ai.proxyUrl` is unchanged. (Optional: raise the Worker's token cap for long solutions.)
5. Optional: add `assets/live/dabsy-character.png` (transparent).
6. Run the checks if you like: `tests/README.md`.
