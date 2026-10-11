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

Description, category, screenshots, promo images — once per language. Every folder in the
package's `_locales` becomes a language in the selector at the top of this tab:

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

The first-listing workflow (`cx-chrome-store-submission`) prepares the material and the item is
created in the dashboard. Before the first version is submitted under the new ID:

- **Allow-lists.** `chrome-extension://<ID>` in backend CORS / allowed origins;
  `https://<ID>.chromiumapp.org/` in the OAuth client's redirect URIs (`launchWebAuthFlow`);
  any membership or login server that whitelists extension IDs. Preflight lists other extension
  IDs in the code — usually the unpacked dev ID these were set up with.
- **Test instructions.** If anything sits behind sign-in, give reviewers a working account and the
  steps to reach the feature. Log in with it yourself first. A reviewer stuck at a login screen
  rejects.
- **Support page and privacy policy.** Both URLs must open for the public without signing in.
  `curl -sIL <url>` should end in 200, not a login redirect.

## Other dashboard-only actions

First listing of a new item · distribution (countries, visibility, trusted testers) · pricing ·
transferring an item · reading the exact reason a submission is refused (press
"Submit for review" in the dashboard — the API only says "does not meet the requirements").
