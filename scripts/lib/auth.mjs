// Access tokens for the Chrome Web Store API. Three ways in, tried in order:
//   1. CWS_ACCESS_TOKEN          a ready token (tests, or CI that mints its own)
//   2. OAuth refresh token       CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN
//                                (CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN also accepted,
//                                matching chrome-webstore-upload-cli)
//   3. gcloud impersonation      a service account named in the config; no key file
// Tokens are never printed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const CWS_SCOPE = "https://www.googleapis.com/auth/chromewebstore";

function env(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return "";
}

export function oauthEnv() {
  return {
    clientId: env("CWS_CLIENT_ID", "CLIENT_ID"),
    clientSecret: env("CWS_CLIENT_SECRET", "CLIENT_SECRET"),
    refreshToken: env("CWS_REFRESH_TOKEN", "REFRESH_TOKEN"),
  };
}

export function authMode(config) {
  if (env("CWS_ACCESS_TOKEN")) return "token";
  const oauth = oauthEnv();
  if (oauth.clientId && oauth.refreshToken) return "oauth";
  if (config.serviceAccount) return "gcloud";
  return "";
}

function which(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.split(/\r?\n/)[0].trim() : "";
}

export function resolveGcloud(config) {
  const candidates = [
    config.gcloud,
    which("gcloud"),
    path.join(os.homedir(), ".local", "bin", "gcloud"),
    "/opt/homebrew/share/google-cloud-sdk/bin/gcloud",
    "/usr/local/share/google-cloud-sdk/bin/gcloud",
    path.join(os.homedir(), "google-cloud-sdk", "bin", "gcloud"),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

export function gcloudValue(gcloud, args) {
  const result = spawnSync(gcloud, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`gcloud ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

async function viaGcloud(config) {
  const gcloud = resolveGcloud(config);
  if (!gcloud) {
    throw new Error("gcloud not found. Install the Google Cloud SDK or set \"gcloud\" in the config.");
  }
  // `gcloud auth print-access-token --impersonate-service-account --scopes` ignores
  // --scopes for impersonation, so mint the scoped token through IAM Credentials.
  const userToken = gcloudValue(gcloud, ["auth", "print-access-token"]);
  const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(config.serviceAccount)}:generateAccessToken`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: [CWS_SCOPE], lifetime: "3600s" }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.accessToken) {
    const reason = json?.error?.message || `HTTP ${response.status}`;
    throw new Error(
      `could not impersonate ${config.serviceAccount}: ${reason}\n` +
        "Your gcloud account needs roles/iam.serviceAccountTokenCreator on that service account " +
        "and the IAM Credentials API enabled. See references/setup.md.",
    );
  }
  return json.accessToken;
}

async function viaOauth() {
  const { clientId, clientSecret, refreshToken } = oauthEnv();
  const body = new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token" });
  if (clientSecret) body.set("client_secret", clientSecret);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.access_token) {
    throw new Error(
      `OAuth refresh failed: ${json?.error_description || json?.error || `HTTP ${response.status}`}. ` +
        "Refresh tokens from an OAuth app in Testing mode expire after 7 days — publish the app or mint a new token.",
    );
  }
  return json.access_token;
}

export async function getAccessToken(config) {
  const mode = authMode(config);
  if (mode === "token") return env("CWS_ACCESS_TOKEN");
  if (mode === "oauth") return viaOauth();
  if (mode === "gcloud") return viaGcloud(config);
  throw new Error(
    "no credentials configured. Either run `setup --service-account EMAIL` (gcloud) " +
      "or export CWS_CLIENT_ID, CWS_CLIENT_SECRET and CWS_REFRESH_TOKEN. See references/setup.md.",
  );
}
