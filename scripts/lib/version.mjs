// Chrome extension versions: 1-4 dot-separated integers, each 0-65535.

export function isValidVersion(version) {
  if (!/^\d+(?:\.\d+){0,3}$/.test(String(version || ""))) return false;
  return String(version)
    .split(".")
    .every((part) => Number(part) <= 65535 && (part === "0" || !part.startsWith("0")));
}

export function compareVersions(left, right) {
  const a = String(left).split(".").map(Number);
  const b = String(right).split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function maxVersion(...versions) {
  return versions
    .filter((version) => version && isValidVersion(version))
    .reduce((best, version) => (!best || compareVersions(version, best) > 0 ? version : best), "");
}

export function bumpVersion(version, kind = "patch") {
  if (!isValidVersion(version)) {
    throw new Error(`cannot bump invalid version "${version}"`);
  }
  const parts = version.split(".").map(Number);
  while (parts.length < 3) parts.push(0);
  const position = { major: 0, minor: 1, patch: 2 }[kind];
  if (position === undefined) throw new Error(`unknown bump kind "${kind}"`);
  parts[position] += 1;
  for (let index = position + 1; index < parts.length; index += 1) parts[index] = 0;
  return parts.join(".");
}

/**
 * Decide the version to upload.
 * - An explicit version wins, but must be above everything the store has.
 * - A local version already above the store is used as-is (a bump that was
 *   never uploaded, or a rerun after a stopped publish) so reruns don't double-bump.
 * - Otherwise bump from whichever is higher: local or store. That covers a store
 *   that is ahead of the local source (a release made from another checkout).
 */
export function planVersion({ local, storeVersions = [], bump = "patch", setVersion = "", noBump = false }) {
  const storeMax = maxVersion(...storeVersions);
  const above = (candidate) => !storeMax || compareVersions(candidate, storeMax) > 0;

  if (setVersion) {
    if (!isValidVersion(setVersion)) {
      return { error: `invalid version "${setVersion}" (use 1-4 numbers, e.g. 1.4.0)` };
    }
    if (!above(setVersion)) {
      return { error: `version ${setVersion} is not above the store's ${storeMax}` };
    }
    return { version: setVersion, reason: "explicit", storeMax };
  }
  if (!isValidVersion(local)) {
    return { error: `manifest version "${local}" is not a valid Chrome version` };
  }
  if (noBump) {
    if (!above(local)) {
      return { error: `--no-bump keeps ${local}, but the store already has ${storeMax}` };
    }
    return { version: local, reason: "kept", storeMax };
  }
  if (storeMax && compareVersions(local, storeMax) > 0) {
    return { version: local, reason: "local-ahead", storeMax };
  }
  const base = maxVersion(local, storeMax) || local;
  return {
    version: bumpVersion(base, bump),
    reason: storeMax && compareVersions(storeMax, local) > 0 ? "store-ahead" : "bumped",
    storeMax,
  };
}
