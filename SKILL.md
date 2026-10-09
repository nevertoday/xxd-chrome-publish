---
name: xxd-chrome-publish
description: >
  Update and publish Chrome extensions that are already listed on the Chrome Web Store, from the
  command line: build, check, package (catching files a naive zip misses), compare with the live
  version, upload, submit for review, and report what still has to be done in the Developer
  Dashboard. Also answers "which of my extensions have unreleased changes?" across a folder.
  Use whenever the user wants to 发布插件、提交插件、更新插件、上传到 Chrome 商店、提交审核、
  谷歌商店更新、看哪些插件可以发、插件审核状态, publish / submit / upload / release a Chrome
  extension, check Web Store review status, or runs /xxd-chrome-publish or /cx-chrome-publish —
  even if they only name the extension ("把 flomo 那个发了"). Not for creating a first listing,
  writing store copy, or making screenshots.
---

# xxd-chrome-publish

Ship updates to already-listed Chrome extensions without opening the dashboard — except for the
few things only the dashboard can do, which this skill detects in advance instead of letting the
store reject the submission.

The CLI is `scripts/xxd-chrome-publish.mjs` in this skill's folder (Node 18+, no dependencies).
Call it as `node <skill-dir>/scripts/xxd-chrome-publish.mjs …`, or by the `xxd-chrome-publish`
command if `scripts/install.sh` linked it onto PATH. Talk to the user in their language; the CLI
prints English.

## What the API can and cannot do

The Chrome Web Store API only uploads packages, submits, cancels a submission, sets the rollout
percentage and reports status. Store listing text, screenshots, **permission justifications**,
data-usage disclosures and the privacy policy URL exist only in the Developer Dashboard. No CLI
can change them (chrome-webstore-upload-cli included). So the job splits in two: the CLI does
everything the API allows, and `preflight` tells the user exactly which dashboard fields the new
version needs, before anything is uploaded.

Browser automation can't fill those fields for the user either: Chrome blocks every extension,
including Claude in Chrome, from scripting Web Store pages ("The extensions gallery cannot be
scripted"). Give the user the link and the text to paste.

## First run on a machine

Run `doctor`. If it fails, read `references/setup.md` and walk the user through it. In short:
`setup --publisher-id <ID from the dashboard URL>`, then credentials — either gcloud
impersonation of a service account (`setup --service-account EMAIL`; the service account goes in
the dashboard's Account page *service account* field — not "Trusted tester accounts") or the
OAuth trio `CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` / `CWS_REFRESH_TOKEN` (good for CI).

Each extension folder is bound once with `bind <dir> --extension-id <ID or store URL>`, which
writes `.chrome-publish.json`. If the user doesn't know the ID, look for a
`chromewebstore.google.com/detail/…` link in the repo (README, website, docs) before asking —
but only trust links in the extension's own repo; third-party bundles embed other people's IDs.

## Publishing an update

1. **Preflight first.** `preflight <dir>` builds (if `package.json` has a `build` script), runs
   the `check` script, packages into a temp folder, plans the version against the store, and
   diffs the manifest against the published package. It changes nothing on the store and doesn't
   touch the source manifest. Read its verdict:
   - `READY to publish` → step 3.
   - `NEEDS DASHBOARD` (exit 3) → step 2.
   - `BLOCKED` (exit 2): a version is in review. Say which, and wait — only cancel it
     (`--cancel-pending`) if the user explicitly says to replace it.
2. **Dashboard to-dos.** For every `[required]` item, draft the justification from the code
   locations preflight printed — say what the extension does with the permission, concretely,
   in one or two English sentences, and that nothing else is done with it. Read
   `references/dashboard.md` for how reviewers read these and for examples. Give the user the
   printed `edit/privacy` link plus the texts, and remind them to press **Save draft**. `[check]`
   items (data-usage disclosure, renamed listing) are advice, not blockers — mention them.
   When the user confirms, continue with `--dashboard-ready`.
3. **Publish.** Publishing is visible to every user of the extension, so do it when the user has
   asked to publish/submit (that request is the go-ahead); after a preflight they didn't ask for,
   show the result and ask. Run `publish <dir>` (plus `--dashboard-ready` if step 2 happened).
   It re-runs the pipeline, uploads, records the new version in `manifest.json` (and
   `package.json` if it tracked the same version), and submits.
4. **If submit is rejected after the upload** (exit 3, "does not meet the requirements"): the
   package is uploaded; something in the dashboard is missing. Ask the user to open the item and
   press "Submit for review" — the dashboard then names the missing field. Once fixed, run
   `submit <dir>`; it submits the uploaded draft without re-uploading or bumping.
5. **Report**: name, old → new version, ZIP path, final state (`PENDING_REVIEW`, …), any store
   warnings (e.g. `INCONSISTENT_LOCALE_METADATA` means localized descriptions disagree), and
   leftover dashboard advice. Then offer to commit the version bump (`--commit` on the next run,
   or `git commit -- manifest.json`) and push — only do either when the user says so.

Several extensions: preflight them all first, collect the dashboard work into one message, then
publish the ready ones.

## "Which extensions can I release?"

`scan <folder>` finds every bound extension below the folder and prints local version, store
version, review state, commits since `manifest.json`'s version last changed, and a next step
(`changes since release — publish?`, `wait for review`, `store ahead — sync source`, …). Use
`--json` when you need to reason over it, then summarise in a short table. For candidates,
`git log` since the version bump shows what changed.

## Command reference

| Command | Does |
|---|---|
| `publish [dir]` (default) | build → check → package → diff → upload → submit |
| `preflight [dir]` | the same up to the upload; no side effects |
| `submit [dir]` | submit the uploaded draft |
| `status [dir]` | store state |
| `scan [folder]` | overview of all bound extensions |
| `pack [dir]` | build + ZIP only, offline |
| `cancel [dir]` / `rollout N [dir]` | withdraw the submission / raise rollout % |
| `bind`, `setup`, `doctor` | configuration |

Useful flags: `--minor`/`--major`, `--set-version X`, `--no-bump`, `--skip-build`,
`--skip-checks`, `--upload-only`, `--staged`, `--zip PATH`, `--json`. Exit codes: 0 ok,
1 error, 2 blocked by a review in progress, 3 dashboard work needed. `--help` lists everything.

Version planning: bump from whichever is higher, local or store (so a store that is ahead of the
checkout doesn't cause a duplicate-version rejection); a local version already above the store is
used as-is, so rerunning after a stop never double-bumps.

Per-project options live in `.chrome-publish.json` — `build`/`check` (a command or `false`),
`packageDir` (package a build output folder), `include`/`exclude` globs. See
`references/troubleshooting.md` for every error message and its fix.

## Things that went wrong before (and are now handled)

- Zipping by reference-walking dropped files a background script injects lazily
  (`files: ["build/panel.js"]`, `{ panel: ["…"] }`). The packager now picks up any string literal
  naming an existing file; still eyeball the file count when a big refactor lands.
- A build directory older than the source got packaged. Builds now run first; a failed build or
  check stops before upload.
- New permissions made the submit fail after the upload. Preflight now catches them.
- 403 while `doctor`'s token works: the service account was in "Trusted tester accounts".
