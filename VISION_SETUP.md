# Give DABSy eyes (phone-friendly, ~5 minutes, free)

**Why this is needed:** your existing `dabsy-brain` Worker only passes text. A picture needs a Worker that forwards it to a vision-capable model.
`vision-worker.js` is a *separate* small Worker. It does not touch or replace `dabsy-brain`, so nothing that works today can break.
It uses **Google Gemini's free tier** (a key you may already have for `dabsy-brain`). No new paid service.

## Steps (all in a phone browser)
1. Open **dash.cloudflare.com** (same account as `dabsy-brain`) -> **Workers & Pages** -> **Create** -> **Create Worker**. Name it `dabsy-vision` -> **Deploy**.
2. Tap **Edit code**. Delete the sample code, paste **all** of `backend/vision-worker.js`, tap **Deploy**.
3. **Settings -> Variables and Secrets -> Add** -> type *Secret*, name `GEMINI_API_KEY`, value = your Gemini key (free from aistudio.google.com/apikey; Cloudflare can't show you the old one, so copy it from AI Studio). Save/deploy.
4. *(Recommended)* add a plain variable `ALLOWED_ORIGIN` = your site's origin, e.g. `https://yourname.github.io` (no path, no slash). This stops other websites using your key.
5. Copy the Worker address, like `https://dabsy-vision.yourname.workers.dev`. Opening it in a browser should show `{"ok":true,"vision":true,"keyConfigured":true}`.
6. In DABSy: **Doodle Space -> ⋯ -> Vision setup**, paste the address, tap **Connect and test**. DABSy sends a tiny generated picture (a random colour and digit) and only says **"I can see pictures ✓"** if it reads them back correctly.
7. *(Optional, makes it permanent for everyone)* put the address in `dabsy-config.js` as `ai.visionUrl` and redeploy the site. Otherwise it is stored only in this phone's browser.

## Good to know
* Your drawing goes to the Worker and then to Google **only when you tap Ask, Read or Check**. Nothing is stored by the Worker.
* Model names change over time. The Worker tries `GEMINI_MODEL` (if you set it), then `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-flash-latest`.
* Free-tier limits apply (DABSy shows "taking a breather" if you hit them).
* If the test says *"ignoring images"*, the address points at a Worker that doesn't forward pictures. If it says *"couldn't reach"*, check the address and the `GEMINI_API_KEY` secret.
