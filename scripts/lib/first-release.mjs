// The first version submitted under a new extension ID. Creating the listing is
// the first-listing workflow's job; by the time this tool runs, the dashboard
// has issued the ID. What breaks next is everything that was set up with a
// development or old ID: sign-in allow-lists, OAuth redirect URIs, backend CORS
// rules, plus the reviewer who can't get past the login screen and the support
// page that is still private.

import fs from "node:fs";
import path from "node:path";

const TEXT = /\.(?:m?js|cjs|html?|json|css)$/i;
const EXTENSION_ID = /(?<![A-Za-z0-9])[a-p]{32}(?![A-Za-z0-9])/g;
const SIGN_IN = /launchWebAuthFlow|getAuthToken|chromiumapp\.org|oauth2?|\/(?:login|signin|sign-in|auth)\b|signInWith|accessToken|refresh_token/i;

function scanLines(rootDir, files, onLine, limit) {
  const hits = [];
  for (const file of files) {
    if (!TEXT.test(file) || file === "manifest.json" || file.startsWith("_locales/")) continue;
    const lines = fs.readFileSync(path.join(rootDir, file), "utf8").split("\n");
    for (let index = 0; index < lines.length && hits.length < limit; index += 1) {
      const hit = onLine(lines[index]);
      if (hit) hits.push({ file, line: index + 1, ...hit });
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Other extensions' IDs hard-coded in the package (a dev ID, an old listing…). */
export function findForeignExtensionIds(rootDir, files, ownId, limit = 6) {
  return scanLines(rootDir, files, (line) => {
    for (const match of line.matchAll(EXTENSION_ID)) {
      if (match[0] === ownId) continue;
      const start = Math.max(0, match.index - 50);
      return { id: match[0], snippet: line.slice(start, match.index + 82).trim() };
    }
    return null;
  }, limit);
}

export function usesSignIn(rootDir, files, manifest) {
  const permissions = [...(manifest.permissions || []), ...(manifest.optional_permissions || [])];
  if (permissions.some((permission) => String(permission).startsWith("identity"))) return true;
  return scanLines(rootDir, files, (line) => (SIGN_IN.test(line) ? {} : null), 1).length > 0;
}

/** Fetch a URL and report whether the public can see it. */
export async function checkPublicPage(url, timeoutMs = 10000) {
  if (!url) return null;
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    const finalUrl = response.url || url;
    // a redirect to a sign-in page is not public
    const login = /accounts\.google\.com|\/login|\/signin|\/sign-in/i.test(finalUrl) && !/\/login|\/signin/i.test(url);
    return { url, status: response.status, ok: response.ok && !login, finalUrl };
  } catch (error) {
    return { url, status: 0, ok: false, error: String(error.cause?.code || error.name || error.message) };
  }
}

/**
 * Dashboard and outside-world to-dos for an item that has never been published.
 * All blocking: a first review that can't sign in, or a support page that
 * 404s, is a rejection.
 */
export function firstReleaseActions({ extensionId, signIn, foreignIds, homepage }) {
  const notes = [
    `chrome-extension://${extensionId}  (backend CORS / allowed origins)`,
    ...(signIn ? [`https://${extensionId}.chromiumapp.org/  (OAuth redirect URI for launchWebAuthFlow)`] : []),
    "the OAuth client / login server / membership backend that whitelists extension IDs",
  ];
  const actions = [{
    blocking: true,
    firstRelease: true,
    title: `First release under ${extensionId}: put the new ID on every sign-in allow-list`,
    zh: `新 ID ${extensionId} 第一次发布：把新 ID 加进所有登录白名单`,
    notes,
    usage: foreignIds.length ? foreignIds : undefined,
    usageLabel: foreignIds.length ? "other extension IDs in the code (dev/old ID?):" : undefined,
  }];
  if (signIn) {
    actions.push({
      blocking: true,
      firstRelease: true,
      title: "First release: give the reviewer a working test account in the dashboard's test instructions (log in with it yourself first)",
      zh: "在后台的测试说明（test instructions）里给审核员一个能登录的测试账号，自己先登一遍确认能用",
    });
  }
  actions.push({
    blocking: true,
    firstRelease: true,
    title: "First release: the support page and privacy policy URL in the dashboard must open for the public, without signing in",
    zh: "后台填的支持页面和隐私政策链接，不登录也要能打开",
    notes: homepage
      ? [`manifest homepage_url ${homepage.url} → ${homepage.ok ? `${homepage.status} ok` : homepage.status ? `HTTP ${homepage.status}${homepage.finalUrl !== homepage.url ? ` (ended at ${homepage.finalUrl})` : ""}` : `unreachable (${homepage.error})`}`]
      : ["no homepage_url in manifest.json — check the dashboard's support/website URL by hand"],
  });
  return actions;
}

/** Foreign IDs in a regular update: worth a look, not a blocker. */
export function foreignIdAction(foreignIds) {
  if (!foreignIds.length) return [];
  return [{
    blocking: false,
    title: "The code mentions other extension IDs — fine for a companion extension; if it's this extension's dev or old ID, links and allow-lists point at the wrong item",
    zh: `[其他扩展 ID] 代码里出现了别的扩展 ID（${foreignIds.slice(0, 3).map((hit) => `${hit.file}:${hit.line}`).join(", ")}）——配套扩展没问题；如果是本插件的开发版或旧 ID，链接和白名单就指错了`,
    usage: foreignIds,
  }];
}
