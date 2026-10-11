# Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| `HTTP 403 … Permission denied` (token minted fine) | the credentials' identity isn't allowed on this publisher | gcloud: service account email in the dashboard's Account → *service account* field (not Trusted testers). OAuth: token must belong to the publisher's owner/member. Check the publisher ID. |
| `could not impersonate …` | your gcloud user lacks `roles/iam.serviceAccountTokenCreator`, or IAM Credentials API is off | see `setup.md` A |
| `OAuth refresh failed: invalid_grant` | refresh token revoked or expired (7-day limit for consent screens in Testing) | publish the consent screen, mint a new token |
| `HTTP 404 Item not found` | wrong extension/publisher ID, or never listed | `bind` again; never listed → first-listing workflow (`cx-chrome-store-submission` + dashboard), then `bind` the new ID |
| `publish failed … does not meet the requirements` | a dashboard field is missing (usually a permission justification, data usage, privacy policy URL) | user presses "Submit for review" in the dashboard to see which; fix; `submit` |
| `version X is still in review` (exit 2) | a submission is pending | wait, or `--cancel-pending` if the user wants to replace it |
| `not above the store's …` | `--set-version`/`--no-bump`/`--zip` version isn't higher than published or in-review | pick a higher version |
| `the store's X is ahead of local Y` | this checkout lacks a release made elsewhere | fine to publish (it bumps from the store), but check whether source changes are missing |
| `the manifest references files that don't exist` | build didn't run, wrong `packageDir`, or a stale path | run the build / fix the path; warnings (popup, web-accessible resources) don't block |
| `build failed` / `check failed` | the project's script exited non-zero | fix it, or `--skip-checks` if the user accepts the risk |
| `could not download the published package` | item unpublished, private, or taken down | the permission diff is skipped — review permissions by hand |
| "The extensions gallery cannot be scripted" | Chrome blocks *extensions* (Claude in Chrome) on Web Store pages | use native computer use or a DevTools-protocol driver instead; fill, Save draft, reload and read back. No such tool: give the user link + text |
| `the locale files would be rejected` | default locale lacks a message the manifest uses, `_locales` without `default_locale`, or broken JSON | fix `_locales/<default>/messages.json` |
| `[required] Check the store listing in …` | multi-language package; those language pages haven't been checked (or a language is new) | fill name/summary/description/screenshots per language, Save draft, then `--dashboard-ready` (records `listingLocales`) |
| `… looks third-party but has no licence` | a vendored/minified library ships without its licence | add the upstream licence as `<name>.LICENSE` next to it |
| `First release under <ID>` items | nothing published under this ID yet | update allow-lists to the new ID, set up a reviewer test account, make the support page public; then `--dashboard-ready` |
| `INCONSISTENT_LOCALE_METADATA` after submit | language pages describe different features | align the detailed descriptions; doesn't block review |
| A feature works unpacked but not from the store | a file loaded at runtime isn't referenced in a way the packager sees | add it to `include` in `.chrome-publish.json`; compare `pack` output with your build folder |

## Checking a package by hand

```bash
xxd-chrome-publish pack . --set-version 9.9.9 --output-dir /tmp/check
unzip -l /tmp/check/*.zip
```

Load `/tmp/check/…zip` unpacked (unzip it, chrome://extensions → Load unpacked) and click
through the features that inject scripts or load assets lazily.
