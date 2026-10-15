# Screenshots: scenario files

`xxd-chrome-publish shots <dir> --scenario FILE` serves the extension folder locally, installs
stand-ins for `chrome.*` (with the real `_locales` behind `chrome.i18n`), puts the page into the
states the scenario describes and captures each one at 1280×800, 24-bit PNG, plus
`00-contact-sheet.png` for review. Start from `assets/scenario.example.json`.

Sample pictures: `xxd-chrome-publish demo-images DIR` writes ten clean flat scenes (`sample-1…10.png`:
landscape, portrait, square and 2.35:1 wide, different subjects; `--count N` for more). Load as
many as the feature shows — a collage tool needs its maximum, an image tool needs every shape it
handles — and don't reuse the same few pictures across all five shots.

Useful options: `--locale ja` (listing language; chrome.i18n and navigator.language both switch),
`--color-scheme dark`, `--only 01` (re-shoot some), `--assets-dir DIR` (where `setInputFiles`
looks), `--raw-dir DIR` (unframed captures of the extension page, 2× for side panels and popups,
plus `elements` crops — material for promo tiles), `--output-dir DIR`.

Default output: `<extension folder>-store-assets/upload-files/screenshots/`, or
`…/upload-files/locales/<locale>/screenshots/` for a non-default `--locale`.

## Five shots, one story

1. **Main view** — what it is for, at a glance; demo data loaded, nothing empty.
2. **Second key interaction** — another mode, view or workflow.
3. **Result / export / batch** — what you get when you're done.
4. **What sets it apart** — membership, AI, templates, automation, history/sync, advanced settings.
5. **Fine control** — the parameters, precision, rules.

The store shows up to five screenshots; make all five (`images` notes fewer). Each shot sells one
thing. Before shooting: no empty areas, no half-open dialogs, no real account
data, no ugly placeholders, still readable as a thumbnail. If the UI isn't translated into a
listing language, that language reuses the default-language shots — say so in its description.

## Top level

```json
{
  "viewport": { "width": 1280, "height": 800 },
  "urlPath": "/sidepanel.html",
  "layout": { "mode": "sidepanel", "panelWidth": 400, "hostUrl": "example.com/editor", "hostTitle": "Editor" },
  "storage": { "local": { "session": { "token": "demo" } } },
  "localStorage": { "theme": "light" },
  "allowNetwork": false,
  "useChromeStubs": true,
  "ready": { "selectors": ["#app"], "function": "document.querySelectorAll('.item').length > 0", "timeoutMs": 15000, "delayMs": 500 },
  "afterLoadActions": [],
  "beforeEachShotActions": [],
  "shots": [ { "name": "01-main-view", "actions": [], "elements": [] } ]
}
```

| Field | Meaning |
|---|---|
| `viewport` | the final image size; 1280×800 for the store |
| `urlPath` | page inside the extension folder (`root` moves the folder, e.g. a build output) |
| `layout.mode` | `page` (default: the page fills 1280×800), `sidepanel` (rendered `panelWidth` wide, right of a browser window), `popup` (`popupWidth` 380, height from content up to `popupMaxHeight` 600, under the toolbar icon). Never stretch a 400px side panel to 1280 |
| `layout.hostImage` / `captureHost` / `hostUrl` / `hostTitle` | the site at the left: an image file, or a live capture of the public `hostUrl` with `captureHost: true`, else an empty article layout. `hostUrl`/`hostTitle` also show in the address bar and come back from `chrome.tabs.query` |
| `storage` | seeds `chrome.storage.local/sync/session` before the page runs — signed-in state, demo history. Never real tokens |
| `localStorage` | seeds `localStorage` before the page runs |
| `allowNetwork` | default `false`: only the local server, `data:` and `blob:` load; real APIs are never called. Seed results through `storage` instead of opening the network |
| `locale`, `colorScheme` | same as `--locale` / `--color-scheme`; the command line wins |
| `ready` | wait for each selector, then the expression, then `delayMs` |
| `afterLoadActions` | once after loading (load demo files, open a panel) |
| `beforeEachShotActions` | before every shot (close dialogs, back to a stable tab) |
| `shots[].name` | file name; keep the `01-` … `05-` order |
| `shots[].actions` | puts the page in this shot's state |
| `shots[].elements` | with `--raw-dir`: `[{ "selector": "#preview", "name": "hero-result", "hide": ["#guides"] }]` crops one element; `hide` hides overlays only during the crop |

## Actions

| `type` | Fields |
|---|---|
| `evaluate` | `script` — run in the page; best for calling the app's own functions and setting state |
| `wait` | `ms` |
| `waitForSelector` | `selector`, `state` (`visible`), `timeoutMs` |
| `waitForFunction` | `script`, `timeoutMs` |
| `click` / `hover` | `selector` |
| `fill` | `selector`, `value` |
| `press` | `key`, optional `selector` |
| `setInputFiles` | `selector`, `files` — absolute, `./` relative to the scenario, or names in `--assets-dir` |
| `check` / `uncheck` | `selector` |
| `select` | `selector`, `value` |
| `scroll` | optional `selector`, `y` |

Prefer `evaluate` with the app's own functions over drags and pixel coordinates. If the command
prints `page errors`, a `chrome.*` API the page relies on may need seeding (`storage`,
`runtimeReply` for the value `chrome.runtime.sendMessage` resolves to).
