// Compare the store's manifest with the one about to be uploaded and work out
// what the Developer Dashboard will demand. The API can upload and submit, but
// permission justifications, data-use disclosures and listing text live only in
// the dashboard — a new permission without a justification makes publish fail
// with "does not meet the requirements".

import fs from "node:fs";
import path from "node:path";

const isHostPattern = (value) => typeof value === "string" && (value === "<all_urls>" || value.includes("://"));

function apiPermissions(manifest, key) {
  return (manifest?.[key] || []).filter((value) => typeof value === "string" && !isHostPattern(value));
}

function hostPatterns(manifest) {
  const hosts = new Set();
  // MV2 mixes hosts into permissions
  for (const value of [...(manifest?.permissions || []), ...(manifest?.host_permissions || [])]) {
    if (isHostPattern(value)) hosts.add(value);
  }
  for (const script of manifest?.content_scripts || []) {
    for (const match of script.matches || []) hosts.add(match);
  }
  return hosts;
}

function optionalHosts(manifest) {
  return new Set([
    ...(manifest?.optional_host_permissions || []),
    ...(manifest?.optional_permissions || []).filter(isHostPattern),
  ]);
}

// Permissions whose use usually means user data is handled, so the dashboard's
// data-usage disclosure should be reviewed when they first appear.
const DATA_SENSITIVE = new Set([
  "identity", "identity.email", "cookies", "history", "bookmarks", "topSites", "tabs",
  "webRequest", "webNavigation", "clipboardRead", "geolocation", "management",
  "privacy", "proxy", "debugger", "pageCapture", "tabCapture", "desktopCapture",
  "downloads", "readingList", "sessions",
]);

const added = (before, after) => [...after].filter((value) => !before.has(value));

/**
 * @param {object|null} store  manifest currently published (null if unknown)
 * @param {object} local       manifest about to be uploaded
 * @param {{storeName?: string, localName?: string}} names resolved display names
 */
export function diffManifests(store, local, names = {}) {
  if (!store) {
    return { known: false, newPermissions: [], newOptionalPermissions: [], newHosts: [], newOptionalHosts: [], changes: [] };
  }
  const newPermissions = added(new Set(apiPermissions(store, "permissions")), apiPermissions(local, "permissions"));
  const newOptionalPermissions = added(
    new Set(apiPermissions(store, "optional_permissions")),
    apiPermissions(local, "optional_permissions"),
  );
  const newHosts = added(hostPatterns(store), hostPatterns(local));
  const newOptionalHosts = added(optionalHosts(store), optionalHosts(local));

  const changes = [];
  const storeName = names.storeName ?? store.name;
  const localName = names.localName ?? local.name;
  if (storeName !== localName) changes.push({ field: "name", from: storeName, to: localName });
  if ((store.description || "") !== (local.description || "")) {
    changes.push({ field: "description", from: store.description || "", to: local.description || "" });
  }
  if (JSON.stringify(store.externally_connectable || null) !== JSON.stringify(local.externally_connectable || null)) {
    changes.push({ field: "externally_connectable", from: store.externally_connectable || null, to: local.externally_connectable || null });
  }
  if ((store.manifest_version || 2) !== (local.manifest_version || 2)) {
    changes.push({ field: "manifest_version", from: store.manifest_version, to: local.manifest_version });
  }
  return { known: true, newPermissions, newOptionalPermissions, newHosts, newOptionalHosts, changes };
}

/**
 * Turn a diff into dashboard to-dos. `blocking` ones make the publish call fail
 * until they are done, so the CLI stops before uploading.
 */
export function dashboardActions(diff) {
  const actions = [];
  if (!diff.known) return actions;
  for (const permission of [...diff.newPermissions, ...diff.newOptionalPermissions]) {
    actions.push({
      blocking: true,
      tab: "privacy",
      permission,
      title: `Justify the new "${permission}" permission`,
    });
  }
  if (diff.newHosts.length || diff.newOptionalHosts.length) {
    actions.push({
      blocking: true,
      tab: "privacy",
      permission: "host",
      hosts: [...diff.newHosts, ...diff.newOptionalHosts],
      title: "Justify the new host permissions",
    });
  }
  const sensitive = [...diff.newPermissions, ...diff.newOptionalPermissions].filter((p) => DATA_SENSITIVE.has(p));
  if (sensitive.length) {
    actions.push({
      blocking: false,
      tab: "privacy",
      title: `Review the data-usage disclosures (${sensitive.join(", ")} usually means user data is handled; "identity" sign-in usually means "Authentication information", which also requires a privacy policy URL)`,
      zh: `[数据用途] 到隐私页检查“数据使用”勾选：${sensitive.join(", ")} 通常意味着会处理用户数据${sensitive.some((p) => p.startsWith("identity")) ? "；用 identity 登录一般要勾“身份验证信息”，并且必须填隐私政策链接" : ""}`,
    });
  }
  for (const change of diff.changes) {
    if (change.field === "name" || change.field === "description") {
      actions.push({
        blocking: false,
        tab: "listing",
        title: `The manifest ${change.field} changed — check the store listing still matches ("${String(change.from).slice(0, 60)}" → "${String(change.to).slice(0, 60)}")`,
        zh: `[商店页] manifest 的${change.field === "name" ? "名称" : "简介"}改了，检查商店页是否还一致（“${String(change.from).slice(0, 60)}” → “${String(change.to).slice(0, 60)}”）`,
      });
    }
  }
  return actions;
}

// Ready-to-paste justifications. Reviewers want: the user-visible feature, the
// API, and that it's used for nothing else. {calls} becomes the chrome.* calls
// found in the code, so the text describes real behaviour.
const DRAFTS = {
  identity: "Used only to sign the user in to the extension's account. {calls} opens Chrome's sign-in window and returns the result to the extension. No other Google account data is read, and the permission is used for nothing else.",
  "identity.email": "Used only to show which account the user is signed in with. {calls} reads the signed-in email address; it is not shared or used for anything else.",
  storage: "Saves the user's settings and data locally in the browser ({calls}). Nothing is sent anywhere through this permission.",
  unlimitedStorage: "Lets the extension keep the user's locally saved data (such as cached images or drafts) beyond the default quota. The data stays on the device.",
  tabs: "Reads the title and URL of the tab the user is working in ({calls}) so the feature they invoked can act on that page. Browsing history is not collected.",
  activeTab: "Gives the extension access to the current page only after the user clicks its toolbar button or menu item, to run the feature they asked for.",
  scripting: "Injects the extension's own packaged scripts into the page the user is on when they use the feature ({calls}). No remote code is executed.",
  contextMenus: "Adds the extension's item to the right-click menu ({calls}) so the user can run its feature on the selected page, text or image.",
  sidePanel: "Shows the extension's interface in Chrome's side panel ({calls}).",
  alarms: "Schedules the extension's own periodic tasks, such as reminders or background refreshes ({calls}).",
  notifications: "Shows the user notifications about the results of actions they started ({calls}).",
  offscreen: "Creates an offscreen document ({calls}) for work a service worker can't do, such as clipboard, audio or DOM parsing. It shows no UI and loads only packaged files.",
  downloads: "Saves files the user chooses to download to their computer ({calls}).",
  cookies: "Reads the cookies of the extension's own service ({calls}) to keep the user signed in. Cookies of other sites are not read.",
  clipboardWrite: "Copies results to the clipboard when the user clicks a copy button.",
  clipboardRead: "Reads the clipboard only when the user pastes into the extension.",
  favicon: "Shows the favicons of the pages the user saved, using Chrome's built-in favicon service ({calls}). No requests go to third-party servers.",
  declarativeNetRequest: "Applies the extension's packaged rules to modify network requests for the feature the user turned on ({calls}). Request contents are not read or collected.",
  webRequest: "Observes requests on the sites the extension works on ({calls}) for the feature the user enabled. Request data is not collected or shared.",
  history: "Reads browsing history only to show it inside the extension when the user searches it ({calls}). History is not sent anywhere.",
  bookmarks: "Reads and creates bookmarks when the user asks the extension to ({calls}).",
  host: "The extension needs access to {hosts} for its feature: it runs there or calls the extension's own service there when the user uses it. It does not run on other sites.",
};

export function draftJustification(permission, usage = [], hosts = []) {
  const template = DRAFTS[permission] || "Used for the extension's {feature} feature ({calls}). It is not used for anything else.";
  const calls = [...new Set(usage.map((hit) => /\b(?:chrome|browser)\??\.[\w.?]+/.exec(hit.snippet)?.[0]?.replace(/\?/g, "") || "").filter(Boolean))].slice(0, 3);
  return template
    .replace(" ({calls})", calls.length ? ` (${calls.join(", ")})` : "")
    .replace("{calls}", calls.length ? calls.join(", ") : "The extension")
    .replace("{hosts}", hosts.join(", "))
    .replace("{feature}", permission);
}

// Permission -> chrome.* namespace, where they differ or there is none.
const API_NAMESPACE = {
  declarativeNetRequestWithHostAccess: "declarativeNetRequest",
  declarativeNetRequestFeedback: "declarativeNetRequest",
  "identity.email": "identity",
  "system.cpu": "system.cpu",
  "system.memory": "system.memory",
  "system.display": "system.display",
  "system.storage": "system.storage",
  activeTab: null,
  background: null,
  unlimitedStorage: null,
};
// Permissions used through a URL, not a chrome.* namespace.
const URL_USAGE = { favicon: /_favicon\//, };

/**
 * Find where packaged code uses a permission, so a justification can describe
 * real behaviour. Returns up to `limit` hits.
 */
export function findPermissionUsage(rootDir, files, permission, limit = 6) {
  if (URL_USAGE[permission]) return scanFiles(rootDir, files, URL_USAGE[permission], limit);
  const namespace = permission in API_NAMESPACE ? API_NAMESPACE[permission] : permission;
  if (!namespace) return [];
  const ns = namespace.replace(/\./g, "\\??\\.");
  // strict: chrome.identity.x / browser?.identity?.x
  const strict = new RegExp(`\\b(?:chrome|browser)\\??\\.${ns}\\??\\.(\\w+)`);
  // loose: someAlias?.identity?.launchWebAuthFlow( — code that wraps the chrome global
  const loose = new RegExp(`\\w\\??\\.${ns}\\??\\.(\\w+)\\s*\\(`);
  const scan = (pattern) => {
    const hits = [];
    for (const file of files) {
      if (!/\.(?:m?js|html?)$/.test(file)) continue;
      const lines = fs.readFileSync(path.join(rootDir, file), "utf8").split("\n");
      for (let index = 0; index < lines.length && hits.length < limit; index += 1) {
        // minified bundles: report the match, not a 300 KB line
        const match = pattern.exec(lines[index]);
        if (!match) continue;
        const start = Math.max(0, match.index - 60);
        hits.push({ file, line: index + 1, snippet: lines[index].slice(start, match.index + 100).trim() });
      }
      if (hits.length >= limit) break;
    }
    return hits;
  };
  const hits = scan(strict);
  return hits.length ? hits : scan(loose).map((hit) => ({ ...hit, loose: true }));
}

function scanFiles(rootDir, files, pattern, limit) {
  const hits = [];
  for (const file of files) {
    if (!/\.(?:m?js|html?|css)$/.test(file)) continue;
    const lines = fs.readFileSync(path.join(rootDir, file), "utf8").split("\n");
    for (let index = 0; index < lines.length && hits.length < limit; index += 1) {
      const match = pattern.exec(lines[index]);
      if (match) hits.push({ file, line: index + 1, snippet: lines[index].slice(Math.max(0, match.index - 60), match.index + 100).trim() });
    }
    if (hits.length >= limit) break;
  }
  return hits;
}
