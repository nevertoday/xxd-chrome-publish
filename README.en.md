# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · **English** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Get a Chrome extension into the Web Store and keep it updated — first listing to every release, from the command line.**

| First listing | Store images | Every update |
|---|---|---|
| Reads your code and prepares the store copy, permission justifications and privacy answers in dashboard order, one folder per language | Screenshots, icons and promo tiles in the colours and type of the extension's own UI, so they look like one product | Build, package, upload, submit — and know **before uploading** whether the store will reject it |

Use it as a command, or as a skill in Claude Code / Codex: "publish this extension", "prepare the listing for it".
MIT licensed. No npm dependencies; screenshots and images install playwright-core into a local cache on first use.

## What it saves you

| Before | With it |
|---|---|
| Upload works, submit fails: *does not meet the requirements* | Preflight names the new permission that needs a justification, and the line of code that uses it |
| Permission justifications and data disclosures written by guesswork | The code is read first: what each permission does, which servers it calls, any remote code |
| A 13-language package, twelve empty store pages | One material folder per language, each confirmed before release — plus languages the package doesn't have yet (Japanese, Korean, Arabic…) |
| A 400px side panel stretched across a screenshot | Side panels and popups shot inside a browser window, with demo data, offline, no real accounts |
| Promo tiles in colours the extension never uses | Colours, fonts and corners read from the extension's rendered pages |
| Lazily loaded files and third-party licences missing from the ZIP | Found and packed |
| A version number the store already has | The next version worked out from both your code and the store |
| No idea which extensions have unreleased changes | One table for all of them |

## See it

Made for the extension "Cover Collage":

![Promo tile: colours, type and square corners from the extension's UI; the hero is the cover it makes](assets/examples/promo-marquee.en.png)

![Store screenshot: the side panel back in a browser window, next to the site it works on](assets/examples/screenshot-sidepanel.png)

A check before publishing:

```
$ xxd-chrome-publish preflight
Image Crop Tool · ~/code/crop · phdjhhjbapkmagifbejfabimojmjngbe
  store     PUBLISHED 1.0.26
  version   1.0.26 → 1.0.27
  package   27 files · 249 KB
  manifest  vs store: +hosts https://api.example.com/*
  dashboard 1 to-do:
    [required] Justify the new host permissions
    open https://chrome.google.com/webstore/devconsole/…/edit/privacy
  => NEEDS DASHBOARD
```

A new site permission. Open the link, write one sentence on why, save, publish — instead of finding out after the upload, the submit and the rejection.

![Publish flow: every step before the upload can stop it](assets/diagrams/flow.en.svg)

## Quick start

**1. Install** (Node 18+)

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # as a command
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # as a Claude skill (Codex: ~/.codex/skills)
```

**2. No store account needed** — in the extension folder:

```bash
xxd-chrome-publish listing .        # prepare the first-listing material
xxd-chrome-publish style .          # read the UI's colours, fonts and corners
xxd-chrome-publish pack . --patch   # bump the version, build an uploadable ZIP
```

**3. To publish, connect your store account** (once — [step by step](references/setup.md))

```bash
xxd-chrome-publish setup --publisher-id <ID from the dashboard URL> --service-account <service account email>
xxd-chrome-publish bind --extension-id <extension ID or store URL>   # once per extension folder
xxd-chrome-publish                                                   # publish
```

## Three situations, and their commands

### First listing

```bash
xxd-chrome-publish listing . --locales ja,ko,ar   # read the code, pack, scaffold in dashboard order
xxd-chrome-publish privacy-page .                 # publish the privacy policy, fill its URL in
xxd-chrome-publish listing . --check              # anything unfinished, Markdown, long summary, missing files
```

The folder it makes (on the Desktop, never in your source):

```
<extension folder>-store-assets/
├── fill-text.md                 paste top to bottom, in dashboard order
├── upload-files/                icon, screenshots, promo tiles, privacy page, ZIP
├── language-versions/<locale>/  per listing language: paste text, full notes, privacy policy
└── working/listing-facts.md     the evidence: where each permission is used, which servers are called
```

Then create the item in the dashboard, upload the ZIP and paste. Once it has an ID, `bind` it; the first release checks sign-in allow-lists, a reviewer test account and a public support page first.

### Store images

| You want to | Type |
|---|---|
| Shoot listing screenshots from a scenario (`--locale ja` for Japanese) | `xxd-chrome-publish shots . --scenario shots.json` |
| Read the UI's style for icons and tiles | `xxd-chrome-publish style .` |
| Make 16/32/48/128 icons, the store icon and a review sheet | `xxd-chrome-publish icon . --svg icon.svg` |
| Render a promo tile, checking text that overflows, clips or wraps | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| Check sizes and alpha, and preview the store page | `xxd-chrome-publish images .` |

Everything to upload is 24-bit PNG without alpha, as the store asks. Screenshots need Google Chrome; playwright-core installs into `~/.cache` on first use.

### Every update

| You want to | Type |
|---|---|
| See what would happen, change nothing | `xxd-chrome-publish preflight` |
| Publish the update | `xxd-chrome-publish` |
| Resubmit after fixing the dashboard | `xxd-chrome-publish submit` |
| Check the review | `xxd-chrome-publish status` |
| See which extensions in a folder have unreleased changes | `xxd-chrome-publish scan ~/code` |
| Check the account setup | `xxd-chrome-publish doctor` |

## In an AI assistant

Installed as a skill, just say:

- "Publish the flomo extension", "Which extensions can I release?"
- "Prepare the store listing for this extension, in Japanese, Korean and Arabic too"
- "Make five store screenshots and promo tiles that match the extension's UI"

Every publish ends with a fixed-format report that keeps three facts apart: dashboard saved, package uploaded, submitted for review. It never calls a submission "published" — that happens after Google approves it.

## What it can't do

![What the tool does for you, and what only you can do](assets/diagrams/roles.en.svg)

Google offers no API for these; they happen in the Chrome Developer Dashboard: creating the item, pasting the store copy and privacy answers, uploading images. The tool lays out the text and images in order, with the dashboard links. Chrome doesn't let extensions script store pages, so an AI assistant inside a browser extension can't fill them; an AI with native computer use can fill, save and read back every field.

## Details

<details>
<summary><b>Sign-in: pick one</b></summary>

| Method | For | Needs |
|---|---|---|
| gcloud + service account | your own machine, no key file | Google Cloud SDK and a service account |
| OAuth refresh token | CI (e.g. GitHub Actions) | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |

⚠️ The service account goes in the dashboard Account page's **service account** field, **not** "Trusted tester accounts" next to it — that one gives no API access and leaves you with 403s.

Step by step: [references/setup.md](references/setup.md)

</details>

<details>
<summary><b>All publish options</b></summary>

| Option | Does |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (default 1.2.4) |
| `--set-version 1.5.0` | use exactly this version |
| `--no-bump` | keep the version in manifest.json |
| `--skip-build` / `--skip-checks` | skip the build / check script |
| `--dashboard-ready` | the dashboard is done; carry on |
| `--cancel-pending` | withdraw the version in review and send this one |
| `--upload-only` | upload, don't submit |
| `--staged` | after approval, wait for you to release it |
| `--zip file.zip` | upload this ZIP instead of building one |
| `--commit` | commit the version bump to git afterwards |
| `--json` | machine-readable output |
| `--lang zh` / `--lang en` | language of the closing report, and of the store name in the ZIP's file name; defaults to the system language |

Exit codes: `0` done · `1` error · `2` another version is in review · `3` dashboard to-dos first.
Options of the store-image commands: `xxd-chrome-publish --help`.

</details>

<details>
<summary><b>Per-extension settings</b> (<code>.chrome-publish.json</code>)</summary>

```json
{
  "extensionId": "abcdefghijklmnopabcdefghijklmnop",
  "build": "npm run build",
  "check": false,
  "packageDir": "dist",
  "include": ["assets/models/**"],
  "exclude": ["fixtures/**"]
}
```

| Field | Meaning |
|---|---|
| `extensionId` | the 32 letters in the store URL |
| `build` | build command, or `false`; defaults to the `build` script in package.json |
| `check` | test command, or `false`; defaults to the `check` script in package.json |
| `packageDir` | the folder to package, e.g. `dist` for a build output |
| `include` / `exclude` | files to always pack / never pack |

</details>

<details>
<summary><b>Writing for reviewers, and fixing errors</b></summary>

- Every first-listing field: [references/first-listing.md](references/first-listing.md)
- Screenshot scenarios: [references/screenshots.md](references/screenshots.md) · Icons and promo tiles: [references/store-images.md](references/store-images.md)
- Permission justifications reviewers accept: [references/dashboard.md](references/dashboard.md)
- Errors and fixes: [references/troubleshooting.md](references/troubleshooting.md)

</details>

<details>
<summary><b>Updating and developing</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # update (the skill link and the command both point here)
npm test                                # tests run against a local fake store; nothing is published
npm run diagrams                        # regenerate the diagrams after editing build.mjs
```

</details>

MIT licence
