# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · **English** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Ship updates to your Chrome extensions with one command.**
It builds, zips, uploads and submits for review — and tells you *before uploading* if the Chrome Web Store is going to reject it.

Use it as a command, or as a skill in Claude Code / Codex: just say "publish my extension".

> Listed extensions get their updates published directly. For a first listing, `xxd-chrome-publish listing` prepares the dashboard text, permission justifications, privacy answers and package in every listing language; you then create the item in the Chrome dashboard and paste.

![Publish flow: every step before the upload can stop it](assets/diagrams/flow.en.svg)

## What it fixes

![The dashboard step moves to before the upload](assets/diagrams/before-after.en.svg)

| Before | With xxd-chrome-publish |
|---|---|
| Upload works, then submit fails: *"does not meet the requirements"* | You're told first which permission needs a note in the dashboard — and which line of your code uses it |
| Files your code loads later are missing from the zip, so a feature breaks | They're found and packed |
| An old build gets uploaded by mistake | Your build and test scripts run first; if they fail, nothing is uploaded |
| The version number clashes with the store | The next version is worked out from both your code and the store |
| You forget which extensions have unreleased changes | One table lists them all |
| A multi-language package goes up, but the other languages' store pages stay empty | Every language is listed; nothing uploads until you've checked them in the dashboard |
| Licence files are left out of the zip | LICENSE, NOTICE and third-party licences are packed automatically |

## Quick start

**1. Install**

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # as a Claude skill (Codex: ~/.codex/skills)
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # as a command
```

**2. Connect your store account** (once — [step-by-step](references/setup.md))

```bash
xxd-chrome-publish setup --publisher-id <ID in your dashboard URL> --service-account <email>
```

**3. Link each extension folder** (once)

```bash
cd my-extension
xxd-chrome-publish bind --extension-id <extension ID or store link>
```

**4. Publish**

```bash
xxd-chrome-publish
```

## Everyday commands

| You want to | Run |
|---|---|
| See what would happen, without changing anything | `xxd-chrome-publish preflight` |
| Publish an update | `xxd-chrome-publish` |
| Submit again after fixing the dashboard | `xxd-chrome-publish submit` |
| Check the review status | `xxd-chrome-publish status` |
| See which extensions have unreleased changes | `xxd-chrome-publish scan ~/code` |
| Check that your setup works | `xxd-chrome-publish doctor` |
| First listing: prepare the dashboard material and package per language | `xxd-chrome-publish listing . --locales ja,ko,ar` |
| Just a ZIP (`--patch` bumps the version first) | `xxd-chrome-publish pack . --patch` |
| Publish the privacy policy as a public page and fill its URL in | `xxd-chrome-publish privacy-page .` |

In Claude Code / Codex, just ask: *"publish the flomo extension"*, *"which of my extensions can I release?"*

## Store images

It also makes the screenshots, the icon and the promo tiles — as one set with the extension's UI: colours, fonts and corners are read from the extension's real pages, not picked separately, and the hero of each tile comes from what the extension actually does (the thing it makes, or the site plus its side panel).

| You want to | Type |
|---|---|
| capture listing screenshots from a scenario (side panels and popups framed in a browser window) | `xxd-chrome-publish shots . --scenario shots.json` |
| read the UI's colours, fonts, corners and current icon | `xxd-chrome-publish style .` |
| make 16/32/48/128 icons, the store icon and a review sheet | `xxd-chrome-publish icon . --svg icon.svg` |
| render a promo tile and check its layout | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| check sizes and alpha, and get a store-page preview | `xxd-chrome-publish images .` |

- `--locale ja` shoots the Japanese listing; screenshots run offline with demo data only.
- Everything to upload is 24-bit PNG without alpha, in `<extension folder>-store-assets/upload-files/` on the Desktop.
- Needs Google Chrome; playwright-core installs itself on first use (into `~/.cache` — the package itself stays dependency-free).

## What a check looks like

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
  stages
    ✗ dashboard  NOT done — 1 required item above
    ✗ package    not uploaded
    ✗ review     not submitted
```

This one found a new website permission. Open the link, write one sentence about why the extension needs it, save, then publish. The last three lines keep the stages apart — dashboard saved, package uploaded, submitted for review — so a step that didn't happen can't hide.

## What it can't do

![What the tool does, and what only you can do](assets/diagrams/roles.en.svg)

Google has no API for these, so they stay in the Chrome dashboard:

- creating the item and pasting the listing material (`listing` prepares it; once the new ID exists, the first release here checks sign-in allow-lists, a reviewer test account and a public support page first)
- store description and screenshots (one page per language)
- the privacy tab: permission notes, data use, privacy policy link

The tool tells you exactly what to fill in, and where. Chrome blocks extensions from controlling store pages, so a browser-extension agent can't fill them — but an AI with native computer use can: it types, uploads, saves, then reads the page back to check.

## Details

<details>
<summary><b>Signing in: two ways</b></summary>

| Way | Good for | What you need |
|---|---|---|
| gcloud + service account | your own computer, no secret files | Google Cloud SDK, a service account |
| OAuth refresh token | CI (e.g. GitHub Actions) | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |

⚠️ The service account goes in the **service account** field on the dashboard's Account page — **not** in "Trusted tester accounts". That box gives no API access, and you'll get 403 errors.

Full steps: [references/setup.md](references/setup.md)

</details>

<details>
<summary><b>All options</b></summary>

| Option | What it does |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (default is 1.2.4) |
| `--set-version 1.5.0` | use exactly this version |
| `--no-bump` | keep the version that's in manifest.json |
| `--skip-build` / `--skip-checks` | don't run your build / test script |
| `--dashboard-ready` | you've filled in the dashboard — go ahead |
| `--cancel-pending` | withdraw the version in review and send this one |
| `--upload-only` | upload, but don't submit |
| `--staged` | after approval, wait for you to release it |
| `--zip file.zip` | upload this zip instead of making one |
| `--commit` | git-commit the new version number afterwards |
| `--json` | machine-readable output |
| `--lang zh` / `--lang en` | language of the closing REPORT block, and which language’s store name the ZIP is named after (the name Google shows you); defaults to the system language |

Exit codes: `0` done · `1` error · `2` another version is in review · `3` fill in the dashboard first

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
| `extensionId` | the 32-letter ID from the store link |
| `build` | build command, or `false`. Default: the `build` script in package.json |
| `check` | test command, or `false`. Default: the `check` script in package.json |
| `packageDir` | folder to zip, if your build writes to e.g. `dist` |
| `include` / `exclude` | always pack / never pack these files |

</details>

<details>
<summary><b>Update and develop</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # update (the skill link and the command both point here)
npm test                                 # run the tests (uses a fake local store)
npm run diagrams                         # regenerate the diagrams (after editing build.mjs)
```

Writing permission notes reviewers accept: [references/dashboard.md](references/dashboard.md) ·
Error messages and fixes: [references/troubleshooting.md](references/troubleshooting.md)

</details>

MIT License
