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
    });
  }
  for (const change of diff.changes) {
    if (change.field === "name" || change.field === "description") {
      actions.push({
        blocking: false,
        tab: "listing",
        title: `The manifest ${change.field} changed — check the store listing still matches ("${String(change.from).slice(0, 60)}" → "${String(change.to).slice(0, 60)}")`,
      });
    }
  }
  return actions;
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

/**
 * Find where packaged code uses a permission, so a justification can describe
 * real behaviour. Returns up to `limit` hits.
 */
export function findPermissionUsage(rootDir, files, permission, limit = 6) {
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
