# Setup

One publisher ID plus one way to get an access token. Pick **A** on your own machine (no secrets
stored), **B** for CI or if you don't use Google Cloud SDK.

## Publisher ID

Open https://chrome.google.com/webstore/devconsole — the URL becomes
`…/devconsole/<PUBLISHER_ID>`. Save it:

```bash
xxd-chrome-publish setup --publisher-id <PUBLISHER_ID>   # a full dashboard URL works too
```

## A. gcloud + service-account impersonation (recommended locally)

No key file is created; gcloud's own login mints a short-lived token for the service account.

```bash
gcloud auth login
gcloud config set project <PROJECT>          # any project you own; create one if needed
gcloud services enable chromewebstore.googleapis.com iamcredentials.googleapis.com

gcloud iam service-accounts create chrome-webstore-publisher \
  --display-name "Chrome Web Store publisher"
SA=chrome-webstore-publisher@<PROJECT>.iam.gserviceaccount.com

# let your own Google account mint tokens for it
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member "user:$(gcloud config get-value account)" \
  --role roles/iam.serviceAccountTokenCreator
```

Then in the Developer Dashboard → **Account**, put `$SA` in the **service account** field and
save. Each publisher accepts one service account. The **Trusted tester accounts** box on the
same page is unrelated — it only lets those accounts install unlisted test builds and grants no
API access (a 403 with a working token usually means the email went there).

```bash
xxd-chrome-publish setup --service-account "$SA"
xxd-chrome-publish doctor /path/to/extension
```

Don't create a JSON key for the service account; impersonation makes it unnecessary, and a
leaked key can publish to every extension you own.

## B. OAuth refresh token (CI friendly, same as chrome-webstore-upload-cli)

1. In Google Cloud Console: enable **Chrome Web Store API**, configure the OAuth consent screen
   (External; *publish* it — refresh tokens of apps left in "Testing" expire after 7 days),
   and create an OAuth client of type **Desktop app**.
2. Get a refresh token for scope `https://www.googleapis.com/auth/chromewebstore`, e.g. with the
   OAuth 2.0 Playground (gear icon → "Use your own OAuth credentials"), signed in as the
   account that owns the publisher.
3. Export:

```bash
export CWS_CLIENT_ID=…  CWS_CLIENT_SECRET=…  CWS_REFRESH_TOKEN=…
```

`CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` are accepted too, so existing
chrome-webstore-upload-cli secrets work unchanged. In GitHub Actions:

```yaml
- run: node xxd-chrome-publish/scripts/xxd-chrome-publish.mjs publish . --skip-checks
  env:
    CWS_PUBLISHER_ID: ${{ secrets.CWS_PUBLISHER_ID }}
    CWS_CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
    CWS_CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
    CWS_REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
```

## Bind each extension

```bash
cd /path/to/extension
xxd-chrome-publish bind --extension-id <ID or https://chromewebstore.google.com/detail/…/ID>
```

This writes `.chrome-publish.json`. The ID is public, so committing the file is fine.

## Files and environment

| What | Where |
|---|---|
| Global config | `~/.config/xxd-chrome-publish/config.json` (`XXD_CHROME_PUBLISH_CONFIG` overrides). Older `~/.config/cx-chrome-publish/config.json` is read if the new one doesn't exist. |
| Per extension | `<dir>/.chrome-publish.json` |
| ZIPs | `~/Desktop` (or `outputDir` in the config / `--output-dir`); never inside the project |
| Env overrides | `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`, `CWS_ACCESS_TOKEN`, `CWS_API_BASE`, `CWS_CRX_URL_TEMPLATE` |
