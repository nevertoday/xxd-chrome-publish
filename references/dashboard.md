# The dashboard-only part

Everything here lives in the Developer Dashboard
(`https://chrome.google.com/webstore/devconsole/<publisher>/<item>/edit/<tab>`) and has no API.
Preflight prints the direct link for the tab that needs work.

## Filling it

Chrome refuses to let any *extension* script Web Store pages, Claude in Chrome included. Native
computer use (OS-level screenshots, mouse, keyboard) and DevTools-protocol drivers (a
chrome-devtools MCP on the user's signed-in Chrome) are not extensions and can fill the
dashboard. The loop is the same either way:

1. open the tab preflight printed; for the listing, pick the language in the selector;
2. type the text, upload screenshots through the file picker;
3. press **Save draft** and wait for the confirmation;
4. reload, and read back every field you touched — per language — before saying it's saved.

Unsaved fields count as empty when the CLI submits. With no such tool, hand the user the link
and the exact text, and wait for them to confirm.

## Privacy practices tab (`edit/privacy`)

| Field | When the store insists |
|---|---|
| Single purpose | always; one sentence about what the extension is for |
| Permission justification | one box per API permission in the manifest; a new permission without text makes submit fail |
| Host permission justification | when there are host permissions or content-script matches |
| Remote code | declare "No" unless you load and execute code from a server |
| Data usage | tick every category the extension collects or transmits, then the three certifications |
| Privacy policy URL | required as soon as any data-usage category is ticked |

Press **Save draft** after editing — unsaved fields count as empty when the CLI submits.

Common pairings: sign-in with `identity` → tick *Authentication information* (and
*Personally identifiable information* if you read the email) and provide a privacy policy URL.
`cookies`, `history`, `tabs` with URL reading → *Web history*. Reading page text you send to a
server (AI features) → *Website content*.

## Writing justifications reviewers accept

Reviewers check that each permission is needed for the single purpose and used for nothing else.
A good justification names the user action, the API used, and the limit:

- **identity** — "Used only for signing in to the extension's membership service.
  `chrome.identity.launchWebAuthFlow` opens Chrome's sign-in window for our OAuth server and returns
  the authorization code. No Google account data is read."
- **scripting** — "Injects the extension's own packaged scripts into the tab the user is
  editing (x.com) when they press Publish, to insert their Markdown into the editor. No remote code."
- **host permissions** — "The extension works only on x.com and twitter.com, where it reads the
  article editor and inserts content. It doesn't run on other sites." For an API domain:
  "Calls api.example.com, the extension's own backend, to process images the user selects."
- **storage** — "Saves the user's settings and drafts locally."
- **tabs** — "Reads the active tab's URL so the note links back to the page the user saved it from."
- **activeTab** — "Accesses the current page only after the user clicks the toolbar button."
- **contextMenus / sidePanel / offscreen / alarms / notifications** — say which user-visible
  feature uses it ("adds a 'Save to …' item to the right-click menu").

Avoid "required for the extension to work", future features, or lists of every API in the
namespace. Broad hosts (`<all_urls>`, `*://*/*`) trigger an in-depth review — justify why
`activeTab` or a narrower list isn't enough, or narrow it.

## Store listing tab (`edit/listing`)

Check the language selector against the package's `_locales`. Detailed descriptions and local
screenshots are language-specific; the dashboard also has shared/global assets and fields.
Do not mistake an empty local screenshot area for a missing screenshot when a global set applies.

### Prepare the language material first

Use the user's existing asset folder and language drafts rather than creating a competing set.
For each locale from `default_locale` / `_locales`, prepare a paste-ready description in that
language and identify the actual screenshot files to upload. A small inventory is enough:

| Locale / dashboard language | Name + summary source | Detailed description file | Screenshots, in order | Saved and read back |
|---|---|---|---|---|
| `zh_CN` / 中文（中国） | `_locales/zh_CN/messages.json` | existing Chinese draft | local files 01–05 | pending |
| `en` / English | `_locales/en/messages.json` | existing English draft | shared global files 01–05, if UI is the same | pending |

Adapt the rows and file paths to the project; do not leave example filenames or placeholders in
the delivered material. Match underscore locale codes to the dashboard's displayed language
(for example `zh_CN` can appear as `zh-CN`). Confirm the selector rather than clicking by position.

Translate from one feature description so languages agree on functionality, free limits, trials,
membership and privacy. Check whether the UI itself changes with locale: translated store text
does not establish translated UI. If the UI is only Chinese, say so in other-language listings
and reuse the same truthful screenshots. If the UI is translated, prepare corresponding UI
captures. Do not alter the extension's supported languages just to avoid preparing listing text.

Finish with a saved-page check for every language, including which global or local screenshots
actually apply. Recheck affected languages after feature/UI changes even when `listingLocales`
already records an earlier confirmation. Missing optional video or verified-site fields are
not automatically blockers; follow the dashboard's actual required-field messages.

### Fill and verify each language

| Per language | Comes from | What to check |
|---|---|---|
| Name | `_locales/<lang>/messages.json` (the manifest's `__MSG_…__` key) | matches the package — fix the package, not the dashboard |
| Summary | same, the manifest `description` key (132 characters documented) | matches the package |
| Detailed description | dashboard only | present, written in that language, same features as the default language |
| Screenshots | dashboard only | a global set is fine if the UI doesn't change with the language; a translated UI needs screenshots in that language |

An empty detailed description or no screenshots on a language page is what preflight's
`[required] Check the store listing in …` item is for. Uploading the multi-language package does
not fill those pages. Warning `INCONSISTENT_LOCALE_METADATA` after submit means the languages
describe different features; it doesn't block review but can be judged as misleading metadata.

When the manifest `name`/`description` change, check the listing still matches.

## First release under a new ID

`listing` prepares the material ([first-listing.md](first-listing.md)) and the item is created in
the dashboard. Before the first version is submitted under the new ID:

- **Allow-lists, if sign-in uses them.** Check the project's actual ID-dependent configuration:
  `chrome-extension://<ID>` in backend CORS / allowed origins;
  `https://<ID>.chromiumapp.org/` in the OAuth client's redirect URIs (`launchWebAuthFlow`);
  any membership or login server that whitelists extension IDs. Preflight lists other extension
  IDs in the code — usually the unpacked dev ID these were set up with.
- **Test instructions.** If anything sits behind sign-in, give reviewers a working account and the
  steps to reach the feature. Log in with it yourself first. A reviewer stuck at a login screen
  cannot assess the core features. Being signed into the developer dashboard does not provide
  that account. Its access must last throughout review; do not put credentials in listing drafts
  or completion reports. If credentials or backend access are unavailable, finish independent
  preparation and state the concrete remaining check.
- **Support page and privacy policy.** Both URLs must open for the public without signing in.
  `curl -sIL <url>` should end in 200, not a login redirect.

## Other dashboard-only actions

First listing of a new item · distribution (countries, visibility, trusted testers) · pricing ·
transferring an item · reading the exact reason a submission is refused (press
"Submit for review" in the dashboard — the API only says "does not meet the requirements").
