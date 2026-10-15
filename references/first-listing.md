# First listing: everything the dashboard asks for

A new item needs store text, privacy answers, a justification per permission, data-use
disclosures, a privacy policy URL, distribution settings and reviewer notes before it can be
submitted. None of it goes through the API. `xxd-chrome-publish listing <dir>` gathers what the
code can prove, packs the ZIP and lays out a paste-ready folder; you write every answer from that
evidence; `listing --check` says when it is ready to paste. The item itself is then created in
the dashboard (**Add new item**, upload the ZIP), the fields pasted, and once the dashboard shows
the ID: `bind <dir> --extension-id <ID>` and the first release goes through `preflight`.

## The folder

```
<extension folder>-store-assets/
├── README.md                     where to look — written by `listing`
├── fill-text.md                  the default listing language, paste top to bottom
├── upload-files/                 everything a file picker in the dashboard wants
│   ├── store-icon-128.png  promo-small-440x280.png  promo-marquee-1400x560.png
│   ├── screenshots/01…05.png
│   ├── privacy-page/index.html
│   └── <store name> v<version>.zip
├── language-versions/
│   └── <locale>/                 one per listing language (every _locales folder), plus a
│       ├── fill-text.md          reading copy in the user's language when it isn't one (--lang zh)
│       ├── full-submission.md
│       └── privacy-policy.md
└── working/
    ├── listing-facts.md / .json  the evidence: permission call sites, servers, remote code, signals
    └── visuals/                  store-image drafts (see store-images.md)
```

`listing` never overwrites a file that exists, so rerunning it after a code change refreshes the
facts and the ZIP and keeps your writing. Delete a scaffold file to get it fresh.

**More languages.** The dashboard opens a language page for each `_locales` folder in the
uploaded package, nothing else. `--locales ja,ko,ar` prepares folders for languages the package
doesn't have yet and marks them "not in the package yet": that text can only be pasted after
`_locales/<locale>/messages.json` (at least the name and description messages) ships. Adding
locales changes the extension's source — only when the user asks. A package without `_locales`
has one listing language, guessed from its name (Chinese, Japanese, Korean, Arabic or English).
Right-to-left languages (Arabic, Hebrew, Persian, Urdu) are typed as is in the paste blocks; the
privacy page and promo tiles for them get `<html lang="ar" dir="rtl">`.

Every language folder says the same things — same features, limits, trial, membership, data
practices — in its own language only. Don't mix languages in one file; don't put analysis in
`fill-text.md`. Listing languages and UI languages are separate facts: if the UI isn't translated,
that language's description says what language the interface is in.

## Read the code first

Facts first, then words. `working/listing-facts.md` gives the starting points; open the files:

- every background script / service worker, content script, popup / side panel / options page;
- each permission's call sites (listed) — what triggers it, what it reads, where data goes;
- every server in the code (listed): what is sent, when, whose server it is;
- `fetch`, `XMLHttpRequest`, `WebSocket`, `chrome.storage`, `chrome.cookies`, `identity`;
- remote code markers (listed) — `eval`, `new Function`, remote scripts, code-string injection;
- third-party SDKs (analytics, error tracking, ads) — they change the data disclosures;
- sign-in, membership, payments — test instructions and in-app purchases depend on them.

A permission that the facts list as "no use found" is either unused (recommend removing it — extra
permissions get items rejected) or used in a way the scan can't see; say which.

## Paste blocks are plain text

Every block in `fill-text.md` goes straight into a form that shows text as typed: no `**bold**`,
no `#`, no `-`/`*` bullets, no backticks, no decorative symbols. Lists are line breaks or `1.`
`2.`. `listing --check` refuses Markdown inside paste blocks. Headings and notes around the blocks
are for the person pasting and can be Markdown. Put a block in every field — never "see above".

## 1. Store listing (`edit/listing`)

- **Item name** — as in the package (`_locales/<locale>/messages.json`). No "extension", "free",
  "best", no other brands used misleadingly.
- **Summary** — the manifest description, ≤ 132 characters, one sentence, verb first, no
  "A tool that…".
- **Detailed description** — first paragraph: the problem it solves. Then one feature per line
  (line breaks, no bullet characters). Last: who it is for, when they use it. 300–1000
  characters. No "best", "#1", "top", no keyword stuffing — both get items rejected.
- **Category** — one of: Accessibility · Art & Design · Communication · Developer Tools ·
  Education · Entertainment · Functionality & UI · Games · Household · Just for Fun · News &
  Weather · Privacy & Security · Shopping · Social Media & Networking · Tools · Travel ·
  Well-being · Workflow & Planning.
- **Language** — each `_locales` folder is a language page with its own fields.
- **Images** — store icon, screenshots, small promo tile (required), marquee (optional):
  made with the Store images commands (`shots`, `icon`, `tile`), paths listed in `fill-text.md`.
- **Video** (optional, YouTube), **official URL** (needs Search Console verification),
  **homepage URL**, **support URL** (must open publicly), **mature content** (Yes/No).

## 2. Privacy practices (`edit/privacy`)

### Single purpose

One narrow, easy-to-understand sentence. Reviewers compare it with what the extension does;
anything outside it is a rejection. For an extension doing several things, find the one purpose
they all serve instead of listing them.

> Imports Markdown drafts the user provides into the open X Article editor and checks that the post is ready to publish.

### Permission justifications

One field per permission in `permissions` (optional ones too). 2–4 sentences:

1. Start with the use: "The extension uses tabs to …".
2. Name the user action that triggers it: "when the user clicks …", "when the user opens …".
3. For sensitive ones, add the limit: "It does not track browsing history." "It does not read other tabs."

Specifics reviewers look for:

- `tabs` next to `activeTab`: why `activeTab` alone isn't enough.
- `sidePanel`: it is the main interface, not an extra.
- `storage`: what is stored, where, whether it ever leaves the device.
- `scripting`: only packaged files are injected, on which pages, when.
- `identity`: only to sign in to the extension's own account.

> The extension uses the storage permission to save user settings and draft state locally in Chrome extension storage. This data stays in the user's browser and is not sent to the extension developer.

The dashboard has **one** host-permission box: cover every pattern from `host_permissions`,
`optional_host_permissions` and content-script `matches` there — which sites, why, what runs
there. Broad patterns (`<all_urls>`, `*://*/*`, `https://*/*`) trigger an in-depth review: say
why a narrower list or `activeTab` is not enough, or narrow them. More on how reviewers read
these: [dashboard.md](dashboard.md#writing-justifications-reviewers-accept).

### Remote code

"No, I am not using remote code" unless the code really fetches and runs JavaScript. Manifest V3
forbids executing remote code: any finding in the facts' "Remote code" list is either a false
positive you can explain or a blocker to fix before submitting — say so at the top of
`full-submission.md`.

> No. The extension does not load or execute remote JavaScript. All executable code is included in the submitted package.

### Data use

For each dashboard data type, Yes or No with one sentence: what exactly, why, where it goes
(device only / the extension's server / a third party), whether it is anonymised. Types:
personally identifiable information · health · financial and payment · authentication ·
personal communications · location · web browsing activity · user activity · website content ·
form data · user-generated content.

The ones people get wrong — decide from the code and write the reason:

- **Authentication information** — does the extension collect credentials or tokens, or does the
  browser merely send its own cookies on same-site requests?
- **Web browsing activity** — does it read the active tab's URL or history?
- **Website content** — does it read or change page content?
- **User-generated content** — does it handle the user's drafts, notes, uploads?
- **Personally identifiable information** — collected by the extension (an account e-mail), or
  only possibly present inside the user's own content?

When you disclose conservatively (Yes where it's borderline), say why. The privacy policy must say
the same things — the dashboard warns when they disagree.

### Limited Use

Confirm the four statements only if the code makes them true: data used only for the stated
purpose; transferred only to provide that feature, for legal or security reasons, or in a
business transfer; never used for advertising; no human reads it except with consent, for
security, by law, or aggregated. If one isn't true, flag it at the top of `full-submission.md`.

> The extension uses user data only to provide its single stated purpose. It does not sell user data, use it for advertising, transfer it except as needed for the feature the user requested, or allow humans to read it.

### Privacy policy

Required, even when nothing is collected (then it says so). Covers: what is collected; how it is
used; whether it is shared; where it is stored (device / server) and for how long; how users see
and delete it; how changes are announced; a contact; the effective date. Use a contact the user
gives you; never invent one — leave `[CONTACT EMAIL]` and say so.

Write `language-versions/<locale>/privacy-policy.md` per language (plain text), and
`upload-files/privacy-page/index.html`: the default-language policy as a plain, readable page.
It needs a public URL. `xxd-chrome-publish privacy-page <dir>` publishes it on GitHub Pages: a
public repository `<english-name>-privacy` under the signed-in `gh` account (`--repo NAME` when
the name isn't Latin, `--owner USER` for an organisation), `index.html` pushed to `main`, Pages
served from `main` / (root), then it waits until `https://<user>.github.io/<repo>/` opens
publicly with this version and writes that URL into every `fill-text.md`. Rerunning it after an
edit updates the same page. It is visible to everyone: run it when the user asked for it or has
said privacy pages may be published; otherwise ask first.

## 3. Distribution (`edit/distribution`)

- **Visibility** — Public (searchable) · Unlisted (link only) · Private (testers, a Google Group,
  or a domain). Recommend one for this extension.
- **Regions** — all, unless the extension only makes sense in some countries (e.g. it works on
  one country's sites).
- **In-app purchases** — tick "Contains in-app purchases" when there is membership, payment or
  unlocks (the facts list payment signals).

## 4. Test instructions

When anything sits behind sign-in or setup: the steps to reach the main feature, and a reviewer
account that keeps working through the whole review — not an expiring trial. The password never
goes into these files or a report; tell the user to enter it in the dashboard field.

## 5. Risks, at the top of full-submission.md

Flag before anything else, with the fix: remote code; broad hosts; sensitive combinations
(`tabs` + `webRequest` + `<all_urls>`); `webRequest`, `debugger`, `proxy`, `nativeMessaging`;
unused permissions; MV2 leftovers; features near policy lines (ad blocking, scraping);
anything needing an extra review form.

## full-submission.md, per language

In this order: files to upload · the paste fields (same as `fill-text.md`) · store listing notes
· privacy and data-use reasoning · permission evidence (file:line from the facts) · test
instructions · risks · checklist · what you verified (and what you couldn't).

## Checklist before pasting

`listing --check` covers: no TODO left; a field for every permission and the hosts; no Markdown
in paste blocks; summary ≤ 132; README, `fill-text.md`, every language folder with its three
files; icon, small tile, screenshots, privacy page and ZIP in `upload-files/`. You still check:
the privacy URL opens publicly; manifest name and description match the listing; icons
16/32/48/128 exist; the extension was tried unpacked; the store images are done (`images`).

After pasting: Save draft, reload, read every field back in every language, then submit from the
dashboard. Report what was saved and read back — never call it published; review comes first.
