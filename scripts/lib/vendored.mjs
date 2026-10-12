// Files copied in from another repository — a shared client, a rules module, a
// generated table. A test can prove a copy wasn't edited by hand, but not that it
// is still the current one: an intact copy of last week's source ships just as
// happily. Declared in .chrome-publish.json:
//
//   "vendored": [{
//     "file": "lib/shared.js",            // the copy, relative to the extension folder
//     "repo": "/path/to/source-repo",     // a git checkout of the source
//     "path": "clients/shared.js",        // the source inside that repo
//     "ref":  "origin/main",              // what counts as current (default HEAD)
//     "sync": "node scripts/sync.mjs"     // how to refresh it, shown when it is old
//   }]
//
// Before anything is uploaded, each copy must end with the source's content at
// `ref` (a header line above it is fine). A remote ref is fetched first, so a
// stale local checkout of the source repo doesn't pass for current.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function git(repo, args, timeout = 30000) {
  const run = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  return { ok: run.status === 0, out: run.stdout || "", err: String(run.stderr || run.error?.message || "").trim() };
}

// "origin/main" → fetch origin main; "HEAD" or a commit needs no fetch.
function fetchRef(repo, ref) {
  const match = /^([^/]+)\/(.+)$/.exec(ref);
  if (!match) return { fetched: null };
  const remotes = git(repo, ["remote"]).out.split("\n").map((name) => name.trim());
  if (!remotes.includes(match[1])) return { fetched: null };
  const run = git(repo, ["fetch", "--quiet", match[1], match[2]]);
  return { fetched: run.ok, error: run.ok ? "" : run.err.split("\n")[0] };
}

/**
 * One result per declared copy:
 *   ok          — ends with the source at ref
 *   stale       — differs (or the copy is missing): don't ship it
 *   unavailable — the source can't be read here (repo not on this machine…): can't tell
 */
export function checkVendored(rootDir, entries, { fetch = true } = {}) {
  const results = [];
  const fetched = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const file = String(entry?.file || "");
    const repo = entry?.repo ? path.resolve(rootDir, String(entry.repo)) : "";
    const source = String(entry?.path || "");
    const ref = String(entry?.ref || "HEAD");
    const base = { file, repo, path: source, ref, sync: entry?.sync ? String(entry.sync) : "" };
    if (!file || !repo || !source) {
      results.push({ ...base, status: "unavailable", detail: "needs file, repo and path" });
      continue;
    }
    if (!fs.existsSync(repo)) {
      results.push({ ...base, status: "unavailable", detail: `${repo} is not on this machine` });
      continue;
    }
    const key = `${repo}\n${ref}`;
    if (fetch && !fetched.has(key)) fetched.set(key, fetchRef(repo, ref));
    const fetchNote = fetched.get(key)?.fetched === false ? `could not fetch ${ref} (${fetched.get(key).error}); compared with the last fetched one` : "";
    const shown = git(repo, ["show", `${ref}:${source}`]);
    if (!shown.ok) {
      results.push({ ...base, status: "unavailable", detail: `${ref}:${source} not found in ${repo}` });
      continue;
    }
    const copyPath = path.join(rootDir, file);
    const copy = fs.existsSync(copyPath) ? fs.readFileSync(copyPath, "utf8") : null;
    const commit = git(repo, ["rev-parse", "--short", ref]).out.trim();
    const current = copy !== null && copy.endsWith(shown.out);
    results.push({
      ...base,
      commit,
      status: current ? "ok" : "stale",
      detail: copy === null ? "the copy is missing" : current ? "" : `differs from ${ref} (${commit})`,
      note: fetchNote,
    });
  }
  return results;
}
