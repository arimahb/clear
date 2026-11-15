# CLEAR

A Chrome extension that makes web pages calmer and messages clearer, built first for
autistic and other neurodivergent users.

- **Calm mode** stops autoplay, animation and flashing, and can soften harsh colours. Use it
  on one page with a click, or turn it on for every website.
- **Page Forecast** shows what a page contains (videos, popups, length) before you scroll.
- **Explain text** says what a message literally means, what it asks of you, and what
  information is missing. Tone cues are shown as possibilities, never as facts.

Privacy is part of the design: page work happens on your device, and developers cannot see
which pages a user visits. See [PRIVACY.md](PRIVACY.md).

## Status

| Step | Feature | State |
|---|---|---|
| 1 | Foundation: permissions, protocol, privacy checks, demo pages | Done |
| 2 | Calm mode (on demand) | Done |
| 3 | Page Forecast | Done |
| 4 | Always on for chosen sites | Not started |
| 5 | Explain text (on-device first, server fallback) | Not started |
| 6 | Always on for every site (opt-in) | Done |

## Testing CLEAR on your computer (team guide)

This takes about 10 minutes the first time. Nothing is sent anywhere: the extension and the
test pages run only on your own computer.

### What you need

- **Node.js 23.6 or newer.** Check with `node -v`. If it's missing or older, install the
  current version from [nodejs.org](https://nodejs.org).
- **Python 3**, to run a small local web server. Check with `python3 --version` (on Windows,
  `python --version`). No Python? Use the `npx` command in step 3 instead.
- **A Chromium browser:** Google Chrome, Microsoft Edge, Brave, or Chrome for Testing.
  Firefox and Safari won't work.

### Step 1: Get the code and install

```sh
git clone https://github.com/arimahb/clear.git
cd clear
npm install
```

To test a branch other than `main`, run `git checkout <branch-name>` before `npm install`.

### Step 2: Build CLEAR and load it into your browser

```sh
npm run build
```

1. Open your browser and go to `chrome://extensions` (Edge: `edge://extensions`,
   Brave: `brave://extensions`).
2. Turn on **Developer mode** (a switch in the top-right corner).
3. Click **Load unpacked** and choose the folder `.output/chrome-mv3` inside the `clear`
   folder. On a Mac, press **⌘⇧.** in the file picker to show folders starting with a dot.
4. Click the puzzle-piece icon in the toolbar and **pin** CLEAR so its button is always
   visible.

After you pull new code, run `npm run build` again, then click the **reload** arrow on
CLEAR's card in `chrome://extensions`.

### Step 3: Start the test pages on localhost:8000

Open a **second** terminal window in the `clear` folder and run:

```sh
python3 -m http.server 8000 -d demo
```

On Windows use `python` instead of `python3`. Without Python, use
`npx serve demo -l 8000` instead.

Leave this window open while you test. Press **Ctrl+C** in it to stop the server when you're
done.

### Step 4: Test

1. Go to **http://localhost:8000/busy-page.html**. It's meant to be annoying: things move,
   flash, autoplay and pop up.
2. Click the **CLEAR** button in the toolbar, or press **Alt+Shift+C**
   (**Option+Shift+C** on a Mac). The button shows **ON**.
3. Check what happens against the grey "Expect: …" labels on the page:

   | What to check | What should happen |
   |---|---|
   | Spinner, bouncing button, scrolling ticker | They stop moving |
   | Animated GIF | Shows one still picture |
   | Videos (including the one that appears after 3 seconds) | Paused |
   | Embedded player | Replaced by a "Load it" box |
   | Ads | Faded and grey |
   | Carousel ("Top picks") | Stays on one slide within about 5 seconds |
   | Countdown ("OFFERS END IN …") | Stops within about 5 seconds |
   | "WAIT! DON'T GO!" popup (after 5 seconds) | Hidden, with a notice at the bottom left |
   | Colours | Softer |
   | Box in the bottom-right corner | "Page forecast" with videos, moving parts, popups, ads and length |
   | Flash test (only if flashing light doesn't affect you) | Covered within about a second |

4. Click CLEAR again. Everything should go back to how it was. Videos stay paused, so nothing
   starts by itself.

**Every website:** in the side panel, turn on **Calm every website automatically** and accept
Chrome's prompt. Open or reload a few real websites: each should calm itself as it loads, with
**ON** on the CLEAR button. Click CLEAR to undo it on one page. Use **Leave the site in this tab
alone** to skip a site, and turn the switch off again when you're done.

**Settings:** open Chrome's side panel (the side-panel icon in the toolbar, then choose
CLEAR) to switch each feature on or off. This includes **Hide cookie banners**, which is off
by default, and the colour choice (Original, Soften or Greyscale). Changes apply the next
time you turn calm mode on.

`http://localhost:8000/thread.html` is for the "Explain text" feature, which isn't built yet.

### If something goes wrong

| Problem | Fix |
|---|---|
| Clicking CLEAR does nothing | CLEAR can't run on `chrome://` pages, the Chrome Web Store or new-tab pages. Use the localhost page. Hover over the button: its tooltip says if the page needs reloading. |
| A site looks broken with calm mode on | Click CLEAR to undo it on that page, add the site to **Sites CLEAR leaves alone**, and tell the team which site and what broke. |
| Page shows "This site can't be reached" | The server from step 3 isn't running. Start it again. |
| "Address already in use" in step 3 | Something else is using port 8000. Use `8001` in the command and the address instead. |
| Changes you pulled don't show up | Run `npm run build`, reload CLEAR in `chrome://extensions`, then reload the page. |
| `npm install` fails | Check `node -v` is 23.6 or newer. |

When you report a problem, include your browser, your operating system, which row of the
table failed, and a screenshot if you can.

## Permissions

Requested at install: `activeTab`, `scripting`, `storage`, `sidePanel`.
Out of the box, CLEAR can only touch a page after you click it or use its shortcut.
`contextMenus` will be added with "Explain text" (step 5), for its right-click menu item.

Access to all sites (`optional_host_permissions`) is requested only when you turn on
**Calm every website automatically** in the side panel, and is given back when you turn it off.
That permission is the only record of the choice: removing CLEAR's site access in
`chrome://extensions` turns the feature off too. While it is on, the background registers
`entrypoints/auto.content.ts` for every http and https page. Sites you skip are kept in
Chrome's local storage on your device.

## Development

Requires Node 23.6 or later.

```sh
npm install
npm run dev        # opens Chrome with the extension loaded
npm run check      # type check, tests, build, privacy checks (same as CI)
```

`npm run dev` adds the `tabs` permission and localhost access for hot reload. These are not
in production builds, and `npm run check:manifest` checks the production manifest.

Set `WXT_CLARIFY_ORIGIN` (for example `https://clarify.example.org`) when building for
release. It is the only address extension pages may connect to. The default is
`http://localhost:8787`.

Test pages: open `demo/busy-page.html` (calm mode and forecast) and `demo/thread.html`
(explain text) in Chrome. Each block says what CLEAR should do with it.

## Privacy checks (run in CI)

- `scripts/check-manifest.mjs` fails if the manifest gains any permission, host permission
  or content script not in `scripts/manifest-permissions.snapshot.json`, or if `connect-src`
  allows more than one outside address. Changing the snapshot needs a privacy review.
- `scripts/check-no-network.mjs` fails if code that runs inside web pages uses `fetch`, XHR,
  WebSocket, `sendBeacon`, `EventSource`, WebRTC or a remote URL, or if the CSS CLEAR inserts
  loads anything (`url()` or `@import`). It scans both the source and the built files.
- `tests/protocol.test.mjs` checks that an "Explain text" request with any field besides
  `text` and `lang` (such as a URL or user ID) is rejected.

## Layout

| Path | Purpose |
|---|---|
| `entrypoints/background.ts` | Service worker: injection, menus, site registration, server calls |
| `entrypoints/content.ts` | Injected when you click CLEAR: calm mode and forecast on demand |
| `entrypoints/auto.content.ts` | Registered for every site when you turn that on: calms pages as they load |
| `lib/content-main.ts` | What both of those run in the page (isolated world) |
| `entrypoints/page.content.ts` | Runs in the page's own JavaScript world at page start, for always-on sites |
| `entrypoints/sidepanel/` | Side panel UI |
| `lib/protocol.ts` | Settings, messages and the "Explain text" request/response format |
| `lib/calm.ts`, `lib/forecast.ts` | Calm mode and forecast logic |
| `public/calm.css` | Calm mode's styles, inserted into pages (inert until calm mode turns them on) |
| `server/clarify.ts` | "Explain text" server: holds the AI key, stores nothing |
| `demo/` | Local test pages |
