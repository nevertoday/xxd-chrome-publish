---
name: xxd-chrome-publish
description: >
  Update and publish Chrome extensions that are already listed on the Chrome Web Store, from the
  command line: build, check, package (catching files a naive zip misses, licence files included),
  compare with the live version, check every store-listing language, upload, submit for review,
  and do or report what the Developer Dashboard still needs. Also answers "which of my extensions
  have unreleased changes?" across a folder.
  Use whenever the user wants to 发布插件、提交插件、更新插件、上传到 Chrome 商店、提交审核、
  谷歌商店更新、看哪些插件可以发、插件审核状态, publish / submit / upload / release a Chrome
  extension, check Web Store review status, or runs /xxd-chrome-publish or /cx-chrome-publish —
  even if they only name the extension ("把 flomo 那个发了"). A first listing is not this skill's
  job: hand it to the first-listing workflow (cx-chrome-store-submission), then come back for the
  first release under the new ID.
---

# xxd-chrome-publish

Ship updates to already-listed Chrome extensions. The CLI does everything the Web Store API
allows; preflight finds what only the dashboard can do before anything is uploaded, and you do
that dashboard work too when you have a native computer-use tool — otherwise the user does it.

The CLI is `scripts/xxd-chrome-publish.mjs` in this skill's folder (Node 18+, no dependencies).
Call it as `node <skill-dir>/scripts/xxd-chrome-publish.mjs …`, or by the `xxd-chrome-publish`
command if `scripts/install.sh` linked it onto PATH.

## Every run, step by step (do exactly this)

1. Run `preflight <extension-dir>`. Add `--lang zh` if the user writes Chinese, `--lang en`
   otherwise.
2. The output ends with a block from `======== REPORT` to `======== END REPORT ========`.
   **Your reply to the user is that block, copied as is.** You may add one short sentence
   before it. Do not shorten it, do not drop items (the 建议检查 / "Worth checking" items too),
   do not merge the three stages, and never write "发布完成", "已发布" or "published".
3. Do what the block's last line (下一步 / Next) says, and only when its condition holds:
   - The user asked to publish and the result is "ready" → run the `publish` command it gives.
   - `--dashboard-ready` → only after the user says the dashboard work is saved, or after you
     did it yourself with computer use and read the saved page back (see below).
   - `--cancel-pending` → only if the user explicitly says to withdraw the version in review.
   - Never invent other flags. If a command fails, send its REPORT block and stop.
4. After `publish` or `submit`, send the new REPORT block the same way.

| Exit code | Meaning | You |
|---|---|---|
| 0 | done (preflight: ready) | send REPORT; after a preflight the user asked to publish, run the publish command |
| 1 | error, nothing changed on the store | send REPORT, fix if it's obviously yours (e.g. a typo in a path), otherwise stop |
| 2 | a version is in review | send REPORT, wait |
| 3 | dashboard work first (or the store refused the submission) | send REPORT; do the dashboard items if you can, otherwise wait for the user |

The rest of this file explains the checks behind the report; read it when a step is unclear.

## What the API can and cannot do

The Chrome Web Store API only uploads packages, submits, cancels a submission, sets the rollout
percentage and reports status. Store listing text and screenshots (per language), **permission
justifications**, data-usage disclosures, test instructions and the privacy policy URL exist only
in the Developer Dashboard. No CLI can change them. So the job splits in two: the CLI does
everything the API allows, and `preflight` lists exactly which dashboard fields this version
needs, before anything is uploaded.

**Who fills the dashboard.** Chrome blocks *extensions* from scripting Web Store pages ("The
extensions gallery cannot be scripted"), so Claude in Chrome can't touch them. That is a limit
of extensions, not of automation. A native computer-use tool (OS-level screenshots, mouse and
keyboard) or a DevTools-protocol browser driver (e.g. a chrome-devtools MCP attached to the
user's signed-in Chrome) is not an extension and works. If one is available, fill the fields,
upload the screenshots and press **Save draft** yourself — then reload the page and read back
what was actually saved, field by field and language by language, before calling it done. Only
when no such tool is available, give the user the link and the exact text to paste, and wait.
Saving drafts is within a publish request; submission starts review. It becomes public only
after approval and the applicable automatic or manual release step.

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

## Not listed yet? Hand off first

This skill doesn't create listings. If the item has no ID, or the API answers 404, stop and hand
it to the first-listing workflow — the `cx-chrome-store-submission` skill prepares store copy,
privacy answers, screenshots and the policy page; the item itself is created in the dashboard.
When the dashboard has issued the ID, `bind` it and come back. The first release under that ID
gets a checklist (below), because everything set up with a development or old ID now breaks.

## Publishing an update

1. **Preflight first.** `preflight <dir>` builds (if `package.json` has a `build` script), runs
   the `check` script, packages into a temp folder, plans the version against the store, diffs
   the manifest and the locales against the published package, and lists the licences it packed.
   It changes nothing on the store and doesn't touch the source manifest. Verdicts:
   - `READY to publish` → step 3.
   - `NEEDS DASHBOARD` (exit 3) → step 2.
   - `BLOCKED` (exit 2): a version is in review. Say which, and wait — only cancel it
     (`--cancel-pending`) if the user explicitly says to replace it.
2. **Work through the checks, in this order.** Each `[required]` item must be done and saved
   before `--dashboard-ready`; `[check]` items are advice — mention them.

   **a. Every listing language — always first.** If the manifest has `default_locale` and
   `_locales`, prepare the corresponding submission material **before filling the dashboard**.
   Read [references/dashboard.md](references/dashboard.md#prepare-the-language-material-first):
   inventory every locale, reuse the supplied language drafts, and prepare any missing detailed
   descriptions and screenshot assignments. An English name/summary alone is not a complete
   English listing. Listing languages and translated UI languages are separate facts; don't
   claim the UI is translated just because `_locales` has that language.

   Check each locale's language page in the dashboard's Store listing tab; the API
   can't fill them: uploading a ten-language package leaves nine empty pages unless someone fills
   them. Preflight prints `languages` and a `[required] Check the store listing in …` item with
   each locale's name and summary from `messages.json`. For every listed language, open
   `edit/listing`, switch the language selector to it, and make sure it has:
   - **name and summary** matching that locale's `messages.json` (the package supplies these);
   - **detailed description**, written in that language, describing the same features as the
     default language (different feature lists earn `INCONSISTENT_LOCALE_METADATA`);
   - **screenshots**: one global set is fine while the extension's UI looks the same in every
     language; when the UI itself is translated, that language's page needs screenshots of the
     UI in that language.
   Fill whatever is empty (translate the default description; `chrome-webstore-screenshots`
   can make per-language screenshots), Save draft, reload, and re-check every language. Once
   `--dashboard-ready` gets past this, the checked languages are recorded in
   `.chrome-publish.json` (`listingLocales`), so later releases only stop for new languages — a
   language the published package didn't have always stops, because its page is certainly empty.
   That record is past confirmation, not proof the current descriptions or screenshots still
   match: when features, membership terms or UI change, update the affected material in **all**
   listing languages and read the saved pages back even if preflight says ready.
   Locale files that would stop Chrome loading the package (missing default-locale message,
   no `default_locale`) fail preflight outright; long or missing translations only warn.

   **b. Permissions and privacy.** For every new-permission item, draft the justification from
   the code locations preflight printed — what the extension does with the permission,
   concretely, in one or two English sentences, and that nothing else is done with it. Read
   `references/dashboard.md` for how reviewers read these and for examples. Fill `edit/privacy`
   (or hand the user the link and texts), Save draft, read it back.

   **c. Licences.** The `licenses` row lists what was packed: the root `LICENSE`/`NOTICE`,
   licence files in every folder that ships code (`vendor/qrcode.LICENSE`,
   `bundle.js.LICENSE.txt`), and for a build output (`packageDir`) the project's own licence
   plus `licenses/<dep>/` for npm `dependencies`. A warning like `lib/x.min.js looks third-party
   but has no licence` means the library's licence isn't in the source tree: find it upstream,
   save it as `lib/x.LICENSE`, and rerun — don't ship without it. No `include` entry is needed
   for licence files any more.

   **d. First release under a new ID** (nothing ever published under it). Preflight adds:
   - if the extension signs in, check the ID-dependent configuration it actually uses:
     `chrome-extension://<ID>` in backend CORS / allowed
     origins, `https://<ID>.chromiumapp.org/` as OAuth redirect URI when it signs in with
     `launchWebAuthFlow`, and whatever login or membership server whitelists extension IDs —
     other extension IDs found in the code are listed (usually the dev ID);
   - when the extension signs in: a working reviewer test account in the dashboard's test
     instructions — log in with it yourself first;
   - the support page and privacy policy URL open publicly without signing in (preflight
     fetches `homepage_url`; check the dashboard's URLs the same way).
   A signed-in developer dashboard is not a reviewer account. Use an account that remains
   usable throughout review; don't rely on an expiring short trial. Keep its password out of
   reports and generated listing documents. Verify the applicable checks with available access;
   if backend access or reviewer credentials are missing, finish the independent dashboard work
   and report exactly what is unverified before continuing with `--dashboard-ready`.

   On updates, other extension IDs in the code show up as a `[check]` — fine for a companion
   extension, wrong if it's this extension's old or dev ID.
3. **Publish.** Publishing is visible to every user of the extension, so do it when the user has
   asked to publish/submit (that request is the go-ahead); after a preflight they didn't ask for,
   show the result and ask. Run `publish <dir>` (plus `--dashboard-ready` if step 2 had
   `[required]` items). It re-runs the pipeline, uploads, records the new version in
   `manifest.json` (and `package.json` if it tracked the same version), and submits.
4. **If submit is rejected after the upload** (exit 3, "does not meet the requirements"): the
   package is uploaded; something in the dashboard is missing. Open the item and press "Submit
   for review" (or ask the user to) — the dashboard then names the missing field. Once fixed,
   run `submit <dir>`; it submits the uploaded draft without re-uploading or bumping.
5. **Report — three separate facts, never one "done".** The REPORT block already does this;
   send it. If you add anything, keep the three stages apart:
   - **资料已保存 / dashboard saved** — which dashboard items were filled and saved, and whether
     you read them back (or "the user confirmed" if they did it);
   - **安装包已上传 / package uploaded** — version and ZIP path;
   - **已提交审核 / submitted for review** — the state (`PENDING_REVIEW` …).
   Never call it "发布完成 / published" — a submission is live only after Google approves it
   (and after a manual release with `--staged`). If a stage didn't happen, say so plainly
   (e.g. "已上传，未提交"). Then add the name, old → new version, store warnings (e.g.
   `INCONSISTENT_LOCALE_METADATA`), leftover `[check]` advice, and offer to commit the version
   bump (`--commit` on the next run, or `git commit -- manifest.json .chrome-publish.json`) and
   push — only do either when the user says so.

Several extensions: preflight them all first, collect the dashboard work into one pass, then
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
`--json` output carries `stages.dashboard / uploaded / review`, each with `done` and `text`.

Version planning: bump from whichever is higher, local or store (so a store that is ahead of the
checkout doesn't cause a duplicate-version rejection); a local version already above the store is
used as-is, so rerunning after a stop never double-bumps.

Per-project options live in `.chrome-publish.json` — `build`/`check` (a command or `false`),
`packageDir` (package a build output folder), `include`/`exclude` globs, `vendored` (files
copied from another repo: `{ file, repo, path, ref, sync }` — before upload each copy must end with
the source at `ref`, fetched first; an old copy stops the run, `--allow-stale-copies` overrides), and
`listingLocales` (written by the CLI). See `references/troubleshooting.md` for every error message and its fix.

## Things that went wrong before (and are now handled)

- Zipping by reference-walking dropped files a background script injects lazily
  (`files: ["build/panel.js"]`, `{ panel: ["…"] }`). The packager now picks up any string literal
  naming an existing file; still eyeball the file count when a big refactor lands.
- Nothing references a licence file, so `vendor/*.LICENSE` and `lib/qrcode.LICENSE` were left
  out until hand-written `include` entries patched it. Licences are now collected on their own.
- A multi-language package went up while its extra language pages in the listing were empty.
  The listing check per language is now a required preflight item.
- A build directory older than the source got packaged. Builds now run first; a failed build or
  check stops before upload.
- New permissions made the submit fail after the upload. Preflight now catches them.
- "Extensions can't script the Web Store" was read as "the dashboard can't be automated". It
  can — with native computer use, then reading the saved result back.
- 403 while `doctor`'s token works: the service account was in "Trusted tester accounts".
