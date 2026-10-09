# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · **English** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Ship updates to your Chrome extensions with one command.**
It builds, zips, uploads and submits for review — and tells you *before uploading* if the Chrome Web Store is going to reject it.

Use it as a command, or as a skill in Claude Code / Codex: just say "publish my extension".

> For extensions that are already listed. The very first listing still happens in the Chrome dashboard.

## What it fixes

| Before | With xxd-chrome-publish |
|---|---|
| Upload works, then submit fails: *"does not meet the requirements"* | You're told first which permission needs a note in the dashboard — and which line of your code uses it |
| Files your code loads later are missing from the zip, so a feature breaks | They're found and packed |
| An old build gets uploaded by mistake | Your build and test scripts run first; if they fail, nothing is uploaded |
| The version number clashes with the store | The next version is worked out from both your code and the store |
| You forget which extensions have unreleased changes | One table lists them all |

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

In Claude Code / Codex, just ask: *"publish the flomo extension"*, *"which of my extensions can I release?"*

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
```

This one found a new website permission. Open the link, write one sentence about why the extension needs it, save, then publish.

## What it can't do

Google has no API for these, so they stay in the Chrome dashboard:

- the first listing
- store description and screenshots
- the privacy tab: permission notes, data use, privacy policy link

The tool tells you exactly what to fill in, and where. A browser agent can't do it for you either — Chrome blocks extensions from controlling store pages.

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
```

Writing permission notes reviewers accept: [references/dashboard.md](references/dashboard.md) ·
Error messages and fixes: [references/troubleshooting.md](references/troubleshooting.md)

</details>

MIT License
