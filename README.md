# xxd-chrome-publish

[中文说明](README.zh-CN.md)

Publish updates to Chrome extensions that are **already on the Chrome Web Store** — from the
terminal, or by asking Claude Code / Codex. One command builds, checks, packages, compares with
the live version, uploads and submits for review.

What makes it different from a plain upload script is the **preflight**: before anything is
uploaded, it tells you what the Web Store is going to reject.

```
$ xxd-chrome-publish preflight
Image Crop Tool · ~/code/crop · phdjhhjbapkmagifbejfabimojmjngbe
  store     PUBLISHED 1.0.26
  version   1.0.26 → 1.0.27
  package   27 files · 249 KB
  manifest  vs store: +hosts https://api.example.com/*
  dashboard 1 to-do:
    [required] Justify the new host permissions
               hosts: https://api.example.com/*
    open https://chrome.google.com/webstore/devconsole/…/edit/privacy
  => NEEDS DASHBOARD — fill the [required] items, Save draft, then publish with --dashboard-ready
```

## Why

The Chrome Web Store API can only upload a package and submit it. Permission justifications,
data-usage disclosures, the privacy policy URL and listing text exist **only in the dashboard**.
Every CLI (this one, chrome-webstore-upload-cli, …) hits the same wall, and the usual symptom is
an upload that succeeds followed by `publish failed: does not meet the requirements`.

This tool downloads the published package, diffs its manifest against yours, and lists the new
permissions and hosts that need a justification — with the lines of your code that use them, so
writing the justification takes a minute. It also fixes the packaging mistakes that bite in
practice:

- **Lazy-injected files** — `chrome.scripting.executeScript({ files: [...] })` and maps like
  `{ panel: ["build/panel.js"] }` are picked up; reference-walking zippers silently drop them.
- **Stale builds** — the project's `build` and `check` scripts run first; failures stop the upload.
- **Missing files** — a manifest pointing at a file that doesn't exist is refused before upload.
- **Version clashes** — the next version is computed from both the local manifest and the store
  (published and in review), so a store that is ahead of your checkout doesn't cause a rejection.
- **Reviews in progress** — detected up front instead of failing mid-way.

## Install

As an agent skill (Claude Code, Codex, …):

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish
```

Then just say "publish my extension" / "which of my extensions have unreleased changes?".

As a plain CLI (Node 18+, no dependencies):

```bash
sh ~/.claude/skills/xxd-chrome-publish/scripts/install.sh   # links ~/.local/bin/xxd-chrome-publish
```

## Set up once

```bash
xxd-chrome-publish setup --publisher-id <ID from the dashboard URL>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<project>.iam.gserviceaccount.com
#   …or export CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN (OAuth, good for CI)
cd my-extension && xxd-chrome-publish bind --extension-id <ID or store URL>
xxd-chrome-publish doctor
```

Step-by-step for both credential types: [references/setup.md](references/setup.md).

## Use

```bash
xxd-chrome-publish preflight        # what would happen; touches nothing
xxd-chrome-publish                  # publish: build → check → package → diff → upload → submit
xxd-chrome-publish submit           # after fixing the dashboard: submit the uploaded draft
xxd-chrome-publish scan ~/code      # every bound extension: local vs store, review state, unreleased commits
xxd-chrome-publish status | pack | cancel | rollout 50
```

Flags: `--minor`, `--major`, `--set-version X`, `--no-bump`, `--skip-build`, `--skip-checks`,
`--dashboard-ready`, `--cancel-pending`, `--upload-only`, `--staged`, `--zip PATH`, `--commit`,
`--json`. Exit codes: `0` ok · `1` error · `2` a review is in progress · `3` dashboard work needed.

Per-extension options go in `.chrome-publish.json`:

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

## What it won't do

Create a first listing, edit listing text or screenshots, or fill in the privacy tab — Google
offers no API for these, and Chrome blocks browser extensions (including AI browser agents) from
scripting Web Store pages. The tool tells you exactly what to fill in instead; see
[references/dashboard.md](references/dashboard.md) for justification examples.

## Develop

```bash
npm test   # unit tests + end-to-end runs against a local fake Web Store
```

MIT licensed.
