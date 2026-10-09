// Chrome Web Store API v2 client, plus the public CRX download used to read
// the published manifest. Both base URLs can be overridden for tests:
//   CWS_API_BASE           default https://chromewebstore.googleapis.com
//   CWS_CRX_URL_TEMPLATE   {id} is replaced with the extension ID

import fs from "node:fs";
import path from "node:path";
import { crxToZip, readZip } from "./zip.mjs";

const DEFAULT_CRX_URL =
  "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=200.0&acceptformat=crx2,crx3&x=id%3D{id}%26uc";

export class CwsError extends Error {
  constructor(action, status, message, body) {
    super(`${action} failed (HTTP ${status}): ${message}`);
    this.action = action;
    this.status = status;
    this.apiMessage = message;
    this.body = body;
  }
}

export function apiBase() {
  return (process.env.CWS_API_BASE || "https://chromewebstore.googleapis.com").replace(/\/+$/, "");
}

export function createClient({ token, publisherId, extensionId }) {
  const item = `publishers/${publisherId}/items/${extensionId}`;
  const base = apiBase();

  async function call(action, method, url, body, contentType) {
    const headers = { Authorization: `Bearer ${token}` };
    const init = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = contentType || "application/json";
      init.body = Buffer.isBuffer(body) ? body : JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!response.ok) {
      const message = json?.error?.message || json?.error?.status || text || response.statusText;
      throw new CwsError(action, response.status, message, json);
    }
    return json;
  }

  return {
    item,
    fetchStatus: () => call("fetchStatus", "GET", `${base}/v2/${item}:fetchStatus`),
    upload: (zipBuffer) =>
      call("upload", "POST", `${base}/upload/v2/${item}:upload?uploadType=media`, zipBuffer, "application/zip"),
    publish: ({ staged = false, skipReview = false } = {}) => {
      const body = { publishType: staged ? "STAGED_PUBLISH" : "DEFAULT_PUBLISH" };
      if (skipReview) body.skipReview = true;
      return call("publish", "POST", `${base}/v2/${item}:publish`, body);
    },
    cancelSubmission: () => call("cancelSubmission", "POST", `${base}/v2/${item}:cancelSubmission`, {}),
    setDeployPercentage: (percentage) =>
      call("setPublishedDeployPercentage", "POST", `${base}/v2/${item}:setPublishedDeployPercentage`, {
        deployPercentage: percentage,
      }),
  };
}

/** Wait for an IN_PROGRESS upload to settle. */
export async function waitForUpload(client, { timeoutMs = 180_000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await client.fetchStatus();
    const state = last?.lastAsyncUploadState;
    if (!state || state === "SUCCEEDED") return last;
    if (state === "FAILED" || state === "NOT_FOUND") {
      throw new Error(`upload ${state}: ${JSON.stringify(last)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`upload still IN_PROGRESS after ${Math.round(timeoutMs / 1000)}s`);
}

function revision(status) {
  if (!status) return null;
  const versions = (status.distributionChannels || []).map((channel) => channel.crxVersion).filter(Boolean);
  return { state: status.state || "", versions };
}

/** Flatten a fetchStatus response into what the CLI reasons about. */
export function summarizeStatus(status) {
  const published = revision(status?.publishedItemRevisionStatus);
  const submitted = revision(status?.submittedItemRevisionStatus);
  return {
    published,
    submitted,
    pendingReview: submitted?.state === "PENDING_REVIEW",
    storeVersions: [...(published?.versions || []), ...(submitted?.versions || [])],
    uploadState: status?.lastAsyncUploadState || "",
    takenDown: Boolean(status?.takenDown),
    warned: Boolean(status?.warned),
  };
}

/**
 * Download the published package and return its manifest (and default-locale
 * name). Returns null when the item isn't publicly downloadable (unpublished,
 * private, or taken down) — the diff is then skipped with a warning.
 */
export async function fetchPublishedManifest(extensionId, { saveTo } = {}) {
  const template = process.env.CWS_CRX_URL_TEMPLATE || DEFAULT_CRX_URL;
  const url = template.replace("{id}", extensionId);
  let buffer;
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    buffer = Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
  if (buffer.length < 100) return null;
  if (saveTo) {
    fs.mkdirSync(path.dirname(saveTo), { recursive: true });
    fs.writeFileSync(saveTo, buffer);
  }
  try {
    const zip = readZip(crxToZip(buffer));
    const manifest = JSON.parse(zip.read("manifest.json").toString("utf8"));
    let name = manifest.name;
    const key = /^__MSG_([A-Za-z0-9_@]+)__$/.exec(String(name || ""))?.[1];
    if (key) {
      for (const locale of [manifest.default_locale, "en", "en_US"].filter(Boolean)) {
        const messages = zip.read(`_locales/${locale}/messages.json`);
        const message = messages && JSON.parse(messages.toString("utf8"))?.[key]?.message;
        if (message) {
          name = message;
          break;
        }
      }
    }
    return { manifest, name, files: zip.names() };
  } catch {
    return null;
  }
}

export function dashboardUrl(publisherId, extensionId, tab = "") {
  const base = `https://chrome.google.com/webstore/devconsole/${publisherId}`;
  if (!extensionId) return base;
  return tab ? `${base}/${extensionId}/edit/${tab}` : `${base}/${extensionId}/edit`;
}

/** Plain-language cause and next step for an API failure. */
export function explainError(error, { mode, serviceAccount, publisherId, extensionId }) {
  if (!(error instanceof CwsError)) return String(error?.message || error);
  const lines = [error.message, ""];
  const message = String(error.apiMessage || "").toLowerCase();
  if (error.status === 401 || error.status === 403) {
    if (mode === "gcloud") {
      lines.push(
        "The service account is not allowed to manage this publisher. In the Developer Dashboard → Account,",
        `put ${serviceAccount} in the *service account* field (one per publisher).`,
        'Note: "Trusted tester accounts" on the same page is a different field and grants no API access.',
      );
    } else {
      lines.push(
        "The Google account behind these credentials cannot manage this item. Check that it owns the",
        "publisher (or is a member with publish rights) and that the refresh token has the chromewebstore scope.",
      );
    }
    lines.push(`Also confirm the publisher ID ${publisherId} matches the dashboard URL.`);
  } else if (error.status === 404) {
    lines.push(
      `Item ${extensionId} was not found under publisher ${publisherId}.`,
      "Check both IDs. The API only updates items that already exist; the first listing is made in the dashboard.",
    );
  } else if (error.action === "publish" && message.includes("requirement")) {
    lines.push(
      "The package is uploaded, but the dashboard has an unfinished item (most often a justification for a new",
      "permission, a data-usage disclosure, or a privacy policy URL).",
      `Open ${dashboardUrl(publisherId, extensionId)} and press "Submit for review" — the dashboard lists`,
      "exactly what is missing. Fix it, then run the `submit` command (no re-upload, no new version).",
    );
  } else if (message.includes("version")) {
    lines.push("The store already has this version or a higher one. Bump manifest.json and try again.");
  } else if (message.includes("in progress") || message.includes("pending")) {
    lines.push("A submission is already in review. Wait for it, or run `cancel` first.");
  }
  return lines.join("\n");
}
