#!/usr/bin/env node
// xxd-chrome-publish — update an already-listed Chrome extension from the command line.
// Run with --help for commands. Exit codes: 0 ok · 1 error · 2 blocked (a submission
// is already in review) · 3 dashboard work needed before submitting.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAccessToken, authMode, resolveGcloud, gcloudValue } from "./lib/auth.mjs";
import {
  createClient, waitForUpload, summarizeStatus, fetchPublishedManifest,
  dashboardUrl, explainError,
} from "./lib/cws.mjs";
import { diffManifests, dashboardActions, findPermissionUsage } from "./lib/manifest-diff.mjs";
import { packageExtension, displayName, setManifestVersionText } from "./lib/packager.mjs";
import { planVersion, compareVersions, maxVersion } from "./lib/version.mjs";
import { readZip } from "./lib/zip.mjs";
import {
  TOOL, LOCAL_CONFIG, EXTENSION_ID_RE, loadGlobalConfig, saveGlobalConfig, resolveRoot,
  loadLocalConfig, saveLocalConfig, normalizePublisherId, normalizeExtensionId,
  projectCommands, runCommand, gitInfo, gitCommitManifest, findBoundProjects, defaultOutputDir,
} from "./lib/project.mjs";

const EXIT = { ok: 0, error: 1, blocked: 2, dashboard: 3 };
const COMMANDS = ["publish", "preflight", "pack", "submit", "status", "scan", "cancel", "rollout", "bind", "setup", "doctor"];

const HELP = `${TOOL} — update an already-listed Chrome extension from the command line

Usage: ${TOOL} [command] [extension-dir] [options]

Everyday
  publish      (default) build → check → package → compare with store → upload → submit
  preflight    everything publish does up to the upload, with no side effects on the store
  submit       submit the already-uploaded draft for review (after fixing dashboard items)
  status       store state of one extension
  scan [dir]   table of every bound extension under dir: local vs store, review state,
               commits since the last version bump

Other
  pack         build + package only (no network)
  cancel       withdraw the submission that is in review
  rollout N    raise the published revision's rollout to N percent
  bind         save the extension ID in <dir>/${LOCAL_CONFIG}
  setup        save publisher ID / service account in the global config
  doctor       check credentials, publisher and item access

Options
  --extension-id ID|URL   with bind (a store URL works too)
  --publisher-id ID|URL   with setup or bind
  --service-account EMAIL with setup: gcloud impersonation target
  --gcloud PATH           with setup: gcloud binary
  --output-dir DIR        with setup or any packaging command (default ~/Desktop)
  --patch | --minor | --major   bump kind (default patch)
  --set-version X         upload exactly this version
  --no-bump               keep the manifest version (must be above the store's)
  --zip PATH              upload this ZIP instead of building one
  --skip-build            don't run the build script
  --skip-checks           don't run the check script
  --dashboard-ready       the dashboard to-dos from preflight are done; don't stop for them
  --cancel-pending        withdraw a submission in review, then publish
  --upload-only           upload but don't submit
  --staged                approved revisions wait for you to release them
  --skip-review           ask the store to skip review when the item is eligible
  --commit                git-commit the version bump after a successful submit
  --json                  machine-readable result on stdout
  -h, --help

Credentials (first match wins)
  CWS_ACCESS_TOKEN                                  a ready token
  CWS_CLIENT_ID + CWS_CLIENT_SECRET + CWS_REFRESH_TOKEN   OAuth (CI friendly)
  setup --service-account EMAIL                     gcloud impersonation, no key file

Exit codes: 0 ok · 1 error · 2 blocked by a submission in review · 3 dashboard to-dos first
`;

// ---------- args ----------

function parseArgs(argv) {
  const options = { bump: "patch", positional: [] };
  const flags = {
    "--dashboard-ready": "dashboardReady", "--cancel-pending": "cancelPending",
    "--upload-only": "uploadOnly", "--staged": "staged", "--skip-review": "skipReview",
    "--skip-build": "skipBuild", "--skip-checks": "skipChecks", "--no-bump": "noBump",
    "--commit": "commit", "--json": "json",
  };
  const values = {
    "--extension-id": "extensionId", "--publisher-id": "publisherId", "--service-account": "serviceAccount",
    "--gcloud": "gcloud", "--output-dir": "outputDir", "--set-version": "setVersion", "--zip": "zip",
    "--percentage": "percentage",
  };
  // Older flag spellings map onto commands.
  const legacy = { "--status": "status", "--doctor": "doctor", "--dry-run": "pack", "--bind": "bind", "--setup": "setup" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg in flags) options[flags[arg]] = true;
    else if (arg in legacy) options.legacyCommands = [...(options.legacyCommands || []), legacy[arg]];
    else if (["--patch", "--minor", "--major"].includes(arg)) options.bump = arg.slice(2);
    else if (arg in values) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
      options[values[arg]] = value;
      index += 1;
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg} (see --help)`);
    else options.positional.push(arg);
  }

  if (options.positional[0] && COMMANDS.includes(options.positional[0])) {
    options.command = options.positional.shift();
  }
  if (options.legacyCommands) {
    // `--setup --publisher-id X` and `--bind --extension-id Y` could be combined before
    options.command = options.legacyCommands.includes("setup") ? "setup"
      : options.legacyCommands.includes("bind") ? "bind"
      : options.legacyCommands[0];
    options.alsoBind = options.legacyCommands.includes("bind") && options.command === "setup";
  }
  options.command ||= "publish";
  if (options.command === "rollout" && options.positional[0] && /^\d+$/.test(options.positional[0])) {
    options.percentage = options.positional.shift();
  }
  options.dir = options.positional[0];
  if (options.positional.length > 1) throw new Error("only one directory argument is allowed");
  return options;
}

// ---------- output ----------

const out = {
  json: false,
  line(text = "") {
    // with --json, human text goes to stderr so stdout is pure JSON
    (this.json ? process.stderr : process.stdout).write(`${text}\n`);
  },
  row(label, text) {
    this.line(`  ${label.padEnd(Math.max(10, label.length + 1))}${text}`);
  },
};

function kb(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function tilde(file) {
  return file.startsWith(os.homedir()) ? `~${file.slice(os.homedir().length)}` : file;
}

function describeStore(summary) {
  if (!summary) return "unknown";
  const published = summary.published
    ? `${summary.published.state} ${summary.published.versions.join(", ")}`.trim()
    : "nothing published";
  const submitted = summary.submitted
    ? ` · in review: ${summary.submitted.state} ${summary.submitted.versions.join(", ")}`.trimEnd()
    : "";
  return `${published}${submitted}${summary.takenDown ? " · TAKEN DOWN" : ""}`;
}

class Stop extends Error {
  constructor(code, message, result) {
    super(message);
    this.code = code;
    this.result = result;
  }
}

// ---------- context ----------

async function context(options, { needToken = true } = {}) {
  const { config } = loadGlobalConfig();
  const root = resolveRoot(options.dir);
  const local = loadLocalConfig(root);
  const publisherId = normalizePublisherId(options.publisherId || process.env.CWS_PUBLISHER_ID || local.publisherId || config.publisherId);
  const extensionId = normalizeExtensionId(options.extensionId || process.env.CWS_EXTENSION_ID || local.extensionId);
  const mode = authMode(config);
  const ctx = { config, root, local, publisherId, extensionId, mode, serviceAccount: config.serviceAccount };

  if (!needToken) return ctx;
  if (!publisherId) {
    throw new Error(`no publisher ID. Run \`${TOOL} setup --publisher-id <ID from the dashboard URL>\`.`);
  }
  if (!EXTENSION_ID_RE.test(extensionId)) {
    throw new Error(`no extension ID for ${root}. Run \`${TOOL} bind ${options.dir || "."} --extension-id <ID or store URL>\`.`);
  }
  ctx.token = await getAccessToken(config);
  ctx.client = createClient({ token: ctx.token, publisherId, extensionId });
  return ctx;
}

function heading(ctx) {
  let name = "";
  try {
    const root = path.resolve(ctx.root, ctx.local.packageDir || ".");
    name = displayName(root, JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")));
  } catch {
    // fall back to the folder name
  }
  return `${name || path.basename(ctx.root)} · ${tilde(ctx.root)} · ${ctx.extensionId}`;
}

function explain(ctx, error) {
  return explainError(error, ctx);
}

// ---------- the shared pipeline ----------

/**
 * Everything up to the upload. Never touches the store; the source tree is
 * only changed by the project's own build script.
 */
async function prepare(ctx, options) {
  const { root, local, client, extensionId, publisherId } = ctx;
  const result = { extensionId, root, steps: {} };

  const statusRaw = await client.fetchStatus().catch((error) => {
    throw new Error(explain(ctx, error));
  });
  const store = summarizeStatus(statusRaw);
  result.store = store;
  out.row("store", describeStore(store));

  if (store.pendingReview && !options.cancelPending && !options.preflightOnly) {
    result.blocked = "pending-review";
    return result;
  }

  const packageRoot = path.resolve(root, local.packageDir || ".");
  const sourceManifestPath = fs.existsSync(path.join(root, "manifest.json")) ? path.join(root, "manifest.json") : "";

  if (options.zip) {
    // Upload a given ZIP: read its manifest for the version and the store diff.
    const zipPath = path.resolve(options.zip);
    const zip = readZip(fs.readFileSync(zipPath));
    const manifest = JSON.parse(zip.read("manifest.json").toString("utf8"));
    const storeMax = maxVersion(...store.storeVersions);
    if (storeMax && compareVersions(manifest.version, storeMax) <= 0) {
      throw new Error(`the ZIP has version ${manifest.version}, not above the store's ${storeMax}`);
    }
    result.version = { from: manifest.version, to: manifest.version, reason: "zip" };
    result.package = { zipPath, files: zip.names(), size: fs.statSync(zipPath).size, manifest };
    out.row("package", `${tilde(zipPath)} (given)`);
  } else {
    const localVersion = sourceManifestPath
      ? JSON.parse(fs.readFileSync(sourceManifestPath, "utf8")).version
      : null;

    const commands = projectCommands(root, local);
    for (const step of ["build", "check"]) {
      const skip = step === "build" ? options.skipBuild : options.skipChecks;
      if (!commands[step]) continue;
      if (skip) {
        out.row(step, `skipped (${commands[step]})`);
        continue;
      }
      out.row(step, `${commands[step]} …`);
      const run = runCommand(commands[step], root);
      result.steps[step] = { command: commands[step], ok: run.ok, seconds: run.seconds };
      if (!run.ok) throw new Error(`${step} failed: \`${commands[step]}\` exited with ${run.status}. Nothing was uploaded.`);
      out.row("", `ok in ${run.seconds}s`);
    }

    if (!fs.existsSync(path.join(packageRoot, "manifest.json"))) {
      throw new Error(`no manifest.json in ${packageRoot}${local.packageDir ? " — did the build run?" : ""}`);
    }
    const current = localVersion || JSON.parse(fs.readFileSync(path.join(packageRoot, "manifest.json"), "utf8")).version;
    const plan = planVersion({
      local: current,
      storeVersions: store.storeVersions,
      bump: options.bump,
      setVersion: options.setVersion,
      noBump: options.noBump,
    });
    if (plan.error) throw new Error(plan.error);
    result.version = { from: current, to: plan.version, reason: plan.reason, storeMax: plan.storeMax };
    const why = {
      bumped: "",
      kept: " (kept)",
      explicit: " (--set-version)",
      "local-ahead": " (local already ahead of the store — not bumped again)",
      "store-ahead": ` (the store's ${plan.storeMax} is ahead of local ${current} — bumped from the store; is this checkout missing a release?)`,
    }[plan.reason];
    out.row("version", `${current} → ${plan.version}${why}`);

    const outputDir = options.preflightOnly
      ? fs.mkdtempSync(path.join(os.tmpdir(), `${TOOL}-`))
      : path.resolve(options.outputDir || defaultOutputDir(ctx.config));
    const pkg = packageExtension(packageRoot, {
      version: plan.version,
      outputDir,
      include: local.include,
      exclude: local.exclude,
    });
    const fatal = pkg.missing.filter((item) => item.severity === "error");
    if (fatal.length) {
      const list = fatal.map((item) => `${item.from} → ${item.ref}`).join("\n    ");
      throw new Error(`the manifest references files that don't exist, so Chrome would refuse to load it:\n    ${list}\n  (a build that didn't run, or a stale path). Nothing was uploaded.`);
    }
    for (const item of pkg.missing) {
      out.row("warning", `${item.from} lists ${item.ref}, which doesn't exist (that feature will 404)`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "manifest.json"), "utf8"));
    manifest.version = plan.version;
    result.package = { ...pkg, manifest, packageRoot, sourceManifestPath };
    out.row("package", `${pkg.files.length} files · ${kb(pkg.size)}${options.preflightOnly ? "" : ` → ${tilde(pkg.zipPath)}`}`);
  }

  // Compare with what is live.
  const published = await fetchPublishedManifest(extensionId);
  const localName = result.package.packageRoot
    ? displayName(result.package.packageRoot, result.package.manifest)
    : result.package.manifest.name;
  const diff = diffManifests(published?.manifest || null, result.package.manifest, {
    storeName: published?.name,
    localName,
  });
  result.diff = diff;
  if (!diff.known) {
    out.row("manifest", "could not download the published package — permission check skipped");
  } else {
    const parts = [];
    if (diff.newPermissions.length) parts.push(`+permissions ${diff.newPermissions.join(", ")}`);
    if (diff.newOptionalPermissions.length) parts.push(`+optional ${diff.newOptionalPermissions.join(", ")}`);
    if (diff.newHosts.length) parts.push(`+hosts ${diff.newHosts.join(", ")}`);
    if (diff.newOptionalHosts.length) parts.push(`+optional hosts ${diff.newOptionalHosts.join(", ")}`);
    for (const change of diff.changes) parts.push(`${change.field} changed`);
    out.row("manifest", parts.length ? `vs store: ${parts.join("; ")}` : "no permission or listing-relevant changes vs store");
  }

  const actions = dashboardActions(diff);
  const files = result.package.files || [];
  const usageRoot = result.package.packageRoot;
  for (const action of actions) {
    if (action.permission && action.permission !== "host" && usageRoot) {
      action.usage = findPermissionUsage(usageRoot, files, action.permission);
    }
  }
  result.actions = actions;
  if (actions.length) {
    out.row("dashboard", `${actions.length} to-do${actions.length > 1 ? "s" : ""}:`);
    for (const action of actions) {
      out.line(`    ${action.blocking ? "[required]" : "[check]   "} ${action.title}`);
      if (action.hosts) out.line(`               hosts: ${action.hosts.join(", ")}`);
      for (const hit of action.usage || []) {
        out.line(`               ${hit.file}:${hit.line}  ${hit.snippet.slice(0, 110)}${hit.loose ? "  (via a wrapper)" : ""}`);
      }
      if (action.usage && !action.usage.length) out.line("               (no chrome.* call found — is the permission still needed?)");
    }
    const tabs = [...new Set(actions.map((action) => action.tab))];
    for (const tab of tabs) out.line(`    open ${dashboardUrl(publisherId, extensionId, tab)}`);
    if (store.submitted) {
      out.line(`    (compared with the published ${store.published?.versions.join(", ") || "version"}; the submission in review may already cover some of these)`);
    }
  }
  result.dashboardBlocking = actions.some((action) => action.blocking);
  return result;
}

function persistVersion(prepared) {
  // Record the uploaded version in the source manifest (and package.json when
  // it was tracking the same version), keeping each file's formatting.
  const changed = [];
  const { version } = prepared;
  const manifestPath = prepared.package.sourceManifestPath;
  if (!manifestPath || version.reason === "zip" || version.from === version.to) return changed;
  const text = fs.readFileSync(manifestPath, "utf8");
  fs.writeFileSync(manifestPath, setManifestVersionText(text, version.to));
  changed.push(manifestPath);
  const packageJson = path.join(path.dirname(manifestPath), "package.json");
  if (fs.existsSync(packageJson)) {
    const pkgText = fs.readFileSync(packageJson, "utf8");
    if (JSON.parse(pkgText).version === version.from) {
      fs.writeFileSync(packageJson, setManifestVersionText(pkgText, version.to));
      changed.push(packageJson);
    }
  }
  return changed;
}

// ---------- commands ----------

async function cmdPublish(options) {
  const ctx = await context(options);
  out.line(heading(ctx));

  let prepared = await prepare(ctx, { ...options, preflightOnly: options.command === "preflight" });

  if (prepared.blocked === "pending-review") {
    const version = prepared.store.submitted?.versions.join(", ");
    throw new Stop(EXIT.blocked, `version ${version} is still in review. Wait for it, or rerun with --cancel-pending to withdraw it and submit this one instead.`, prepared);
  }
  if (options.command === "preflight") {
    const pending = prepared.store.pendingReview;
    const verdict = pending
      ? `BLOCKED — ${prepared.store.submitted.versions.join(", ")} is in review (wait, or publish with --cancel-pending)`
      : prepared.dashboardBlocking
        ? "NEEDS DASHBOARD — fill the [required] items, Save draft, then publish with --dashboard-ready"
        : "READY to publish";
    out.line(`  => ${verdict}`);
    const code = pending ? EXIT.blocked : prepared.dashboardBlocking ? EXIT.dashboard : EXIT.ok;
    return { code, result: { ...prepared, verdict } };
  }
  if (prepared.dashboardBlocking && !options.dashboardReady) {
    throw new Stop(
      EXIT.dashboard,
      `stopped before uploading: the store will reject this until the [required] dashboard items are done.\n` +
        `  Fill them in, press "Save draft", then rerun with --dashboard-ready.\n` +
        `  The ZIP is kept at ${tilde(prepared.package.zipPath)}; the source manifest is unchanged.`,
      prepared,
    );
  }

  if (prepared.store.pendingReview && options.cancelPending) {
    await ctx.client.cancelSubmission().catch((error) => {
      throw new Error(explain(ctx, error));
    });
    out.row("cancel", "withdrew the submission that was in review");
  }

  out.row("upload", `${path.basename(prepared.package.zipPath)} …`);
  let upload;
  try {
    upload = await ctx.client.upload(fs.readFileSync(prepared.package.zipPath));
    if (upload.uploadState === "IN_PROGRESS") upload = await waitForUpload(ctx.client);
    if (upload.uploadState === "FAILED") throw new Error(`upload FAILED: ${JSON.stringify(upload)}`);
  } catch (error) {
    throw new Error(explain(ctx, error));
  }
  out.row("", `uploaded ${upload.crxVersion || prepared.version.to}`);
  const changed = persistVersion(prepared);
  if (changed.length) out.row("version", `wrote ${prepared.version.to} to ${changed.map((file) => path.relative(ctx.root, file)).join(", ")}`);

  if (options.uploadOnly) {
    out.line("  => uploaded as a draft (not submitted). Run `submit` when ready.");
    return { code: EXIT.ok, result: { ...prepared, uploaded: true, submitted: false } };
  }
  return submitAndFinish(ctx, options, { ...prepared, uploaded: true, changed });
}

async function submitAndFinish(ctx, options, result) {
  let published;
  try {
    published = await ctx.client.publish({ staged: options.staged, skipReview: options.skipReview });
  } catch (error) {
    throw new Stop(EXIT.dashboard, explain(ctx, error), { ...result, submitted: false });
  }
  const state = published.state || "SUBMITTED";
  out.row("submit", state);
  for (const warning of published.warningInfo?.warnings || []) {
    out.line(`    warning ${warning.reason}: ${warning.description}`);
  }
  let commit = null;
  if (options.commit && result.changed?.length) {
    commit = gitCommitManifest(ctx.root, result.changed, `Release ${result.version.to} to the Chrome Web Store`);
    out.row("git", `committed ${commit} (not pushed)`);
  }
  out.line(`  => ${state === "PENDING_REVIEW" ? "submitted for review" : state.toLowerCase()}`);
  return { code: EXIT.ok, result: { ...result, submitted: true, state, warnings: published.warningInfo?.warnings || [], commit } };
}

async function cmdSubmit(options) {
  const ctx = await context(options);
  out.line(heading(ctx));
  const store = summarizeStatus(await ctx.client.fetchStatus().catch((error) => {
    throw new Error(explain(ctx, error));
  }));
  out.row("store", describeStore(store));
  if (store.pendingReview) throw new Stop(EXIT.blocked, "a submission is already in review.", { store });
  return submitAndFinish(ctx, options, { store, changed: [] });
}

async function cmdStatus(options) {
  const ctx = await context(options);
  const raw = await ctx.client.fetchStatus().catch((error) => {
    throw new Error(explain(ctx, error));
  });
  const store = summarizeStatus(raw);
  const manifest = JSON.parse(fs.readFileSync(path.join(ctx.root, "manifest.json"), "utf8"));
  out.line(heading(ctx));
  out.row("local", manifest.version);
  out.row("store", describeStore(store));
  out.row("dashboard", dashboardUrl(ctx.publisherId, ctx.extensionId));
  return { code: EXIT.ok, result: { extensionId: ctx.extensionId, local: manifest.version, store, raw } };
}

async function cmdScan(options) {
  const { config } = loadGlobalConfig();
  const base = path.resolve(options.dir || process.cwd());
  const projects = findBoundProjects(base);
  if (!projects.length) {
    throw new Error(`no ${LOCAL_CONFIG} found under ${base}. Bind extensions first with \`${TOOL} bind <dir> --extension-id <ID>\`.`);
  }
  const token = await getAccessToken(config);
  const rows = [];
  const queue = [...projects];
  async function worker() {
    while (queue.length) {
      const root = queue.shift();
      const local = loadLocalConfig(root);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
      const extensionId = normalizeExtensionId(local.extensionId);
      const publisherId = normalizePublisherId(local.publisherId || config.publisherId);
      const row = { dir: path.relative(base, root) || ".", name: displayName(root, manifest), extensionId, local: manifest.version, git: gitInfo(root) };
      try {
        row.store = summarizeStatus(await createClient({ token, publisherId, extensionId }).fetchStatus());
      } catch (error) {
        row.error = error.status ? `HTTP ${error.status}` : String(error.message || error);
      }
      row.next = nextStep(row);
      rows.push(row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, projects.length) }, worker));
  rows.sort((a, b) => a.dir.localeCompare(b.dir));

  const table = rows.map((row) => [
    row.dir,
    row.local,
    row.error || (row.store.published ? `${row.store.published.versions.join(",")} ${row.store.published.state === "PUBLISHED" ? "" : row.store.published.state}`.trim() : "—"),
    row.store?.submitted ? `${row.store.submitted.state} ${row.store.submitted.versions.join(",")}` : "",
    row.git ? `${row.git.commitsSinceVersionBump ?? "?"}${row.git.dirty ? ` (+${row.git.dirty} dirty)` : ""}` : "no git",
    row.next,
  ]);
  const header = ["extension", "local", "store", "review", "commits", "next"];
  const widths = header.map((title, index) => Math.min(42, Math.max(title.length, ...table.map((cells) => displayWidth(String(cells[index]))))));
  const fmt = (cells) => cells.map((cell, index) => padDisplay(String(cell), widths[index])).join("  ").trimEnd();
  out.line(fmt(header));
  out.line(widths.map((width) => "-".repeat(width)).join("  "));
  for (const cells of table) out.line(fmt(cells));
  out.line("\ncommits = commits since manifest.json's version last changed, not counting docs/tests/chores");
  return { code: EXIT.ok, result: { base, extensions: rows } };
}

// CJK and full-width characters take two terminal columns.
const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u;
function displayWidth(text) {
  let width = 0;
  for (const char of text) width += WIDE.test(char) ? 2 : 1;
  return width;
}
function padDisplay(text, width) {
  let result = "";
  let used = 0;
  for (const char of text) {
    const w = WIDE.test(char) ? 2 : 1;
    if (used + w > width) break;
    result += char;
    used += w;
  }
  return result + " ".repeat(width - used);
}

function nextStep(row) {
  if (row.error) return "fix access (run doctor)";
  const { store, local, git } = row;
  if (store.takenDown) return "taken down — see dashboard";
  if (store.pendingReview) return "wait for review";
  const storeMax = maxVersion(...store.storeVersions);
  if (!storeMax) return "not published yet";
  const order = compareVersions(local, storeMax);
  if (order < 0) return `store ahead (${storeMax}) — sync source`;
  if (order > 0) return "local version ahead — publish";
  if (git?.commitsSinceVersionBump > 0 || git?.dirty > 0) return "changes since release — publish?";
  return "up to date";
}

async function cmdPack(options) {
  const { config } = loadGlobalConfig();
  const root = resolveRoot(options.dir);
  const local = loadLocalConfig(root);
  const commands = projectCommands(root, local);
  if (commands.build && !options.skipBuild) {
    out.row("build", `${commands.build} …`);
    const run = runCommand(commands.build, root);
    if (!run.ok) throw new Error(`build failed (exit ${run.status})`);
  }
  const packageRoot = path.resolve(root, local.packageDir || ".");
  const pkg = packageExtension(packageRoot, {
    version: options.setVersion || undefined,
    outputDir: path.resolve(options.outputDir || defaultOutputDir(config)),
    include: local.include,
    exclude: local.exclude,
  });
  for (const item of pkg.missing) out.row("warning", `${item.from} lists ${item.ref}, which doesn't exist`);
  if (pkg.missing.some((item) => item.severity === "error")) {
    throw new Error("the manifest references missing files Chrome needs to load the extension (see above)");
  }
  out.row("package", `${pkg.files.length} files · ${kb(pkg.size)} → ${tilde(pkg.zipPath)}`);
  return { code: EXIT.ok, result: { zipPath: pkg.zipPath, files: pkg.files, size: pkg.size, version: pkg.version } };
}

async function cmdCancel(options) {
  const ctx = await context(options);
  const response = await ctx.client.cancelSubmission().catch((error) => {
    throw new Error(explain(ctx, error));
  });
  out.line("withdrew the submission in review");
  return { code: EXIT.ok, result: response };
}

async function cmdRollout(options) {
  const percentage = Number(options.percentage);
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100) {
    throw new Error("rollout needs a percentage between 1 and 100, e.g. `rollout 50`");
  }
  const ctx = await context(options);
  const response = await ctx.client.setDeployPercentage(percentage).catch((error) => {
    throw new Error(explain(ctx, error));
  });
  out.line(`rollout set to ${percentage}%`);
  return { code: EXIT.ok, result: response };
}

async function cmdBind(options) {
  const root = resolveRoot(options.dir);
  const extensionId = normalizeExtensionId(options.extensionId);
  if (!EXTENSION_ID_RE.test(extensionId)) {
    throw new Error("bind needs --extension-id: the 32-letter ID (a–p) or the store URL that contains it");
  }
  if (!fs.existsSync(path.join(root, "manifest.json")) && !loadLocalConfig(root).packageDir) {
    throw new Error(`no manifest.json in ${root}`);
  }
  const next = { ...loadLocalConfig(root), extensionId };
  if (options.publisherId) next.publisherId = normalizePublisherId(options.publisherId);
  const file = saveLocalConfig(root, next);
  out.line(`wrote ${tilde(file)} (the ID is public; committing it is fine)`);
  return { code: EXIT.ok, result: { file, extensionId } };
}

async function cmdSetup(options) {
  const { config, legacy } = loadGlobalConfig();
  const next = { ...config };
  if (options.publisherId) next.publisherId = normalizePublisherId(options.publisherId);
  if (options.serviceAccount) next.serviceAccount = options.serviceAccount.trim();
  if (options.gcloud) next.gcloud = path.resolve(options.gcloud);
  if (options.outputDir) next.outputDir = options.outputDir;
  const file = saveGlobalConfig(next);
  out.line(`saved ${tilde(file)}${legacy ? ` (migrated from ${tilde(legacy)})` : ""}`);
  for (const [key, value] of Object.entries(next)) out.row(key, String(value));
  if (!next.publisherId) out.line("\nnext: add --publisher-id (the ID in https://chrome.google.com/webstore/devconsole/<ID>)");
  if (!next.serviceAccount && !process.env.CWS_REFRESH_TOKEN) {
    out.line("next: add --service-account EMAIL, or export CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN (references/setup.md)");
  }
  if (options.alsoBind && options.extensionId) await cmdBind(options);
  return { code: EXIT.ok, result: { file, config: next } };
}

async function cmdDoctor(options) {
  const checks = [];
  const check = (ok, label, detail = "", hint = "") => {
    checks.push({ ok, label, detail, hint });
    out.line(`[${ok ? " ok " : "FAIL"}] ${label}${detail ? `: ${detail}` : ""}`);
    if (!ok && hint) out.line(`       ${hint}`);
    return ok;
  };
  const major = Number(process.versions.node.split(".")[0]);
  check(major >= 18, "node", process.versions.node, "Node 18+ is required (built-in fetch).");

  const { config, path: configPath, legacy } = loadGlobalConfig();
  check(true, "config", tilde(legacy || configPath));
  const mode = authMode(config);
  if (!check(Boolean(mode), "credentials", mode || "none", "Run `setup --service-account EMAIL` or export CWS_CLIENT_ID/CWS_CLIENT_SECRET/CWS_REFRESH_TOKEN.")) {
    return { code: EXIT.error, result: { checks } };
  }
  if (mode === "gcloud") {
    const gcloud = resolveGcloud(config);
    if (check(Boolean(gcloud), "gcloud", gcloud || "not found", "Install the Google Cloud SDK or `setup --gcloud PATH`.")) {
      try {
        check(true, "gcloud account", gcloudValue(gcloud, ["config", "get-value", "account"]) || "(none)");
      } catch (error) {
        check(false, "gcloud account", error.message, "Run `gcloud auth login`.");
      }
    }
  }
  let token = "";
  try {
    token = await getAccessToken(config);
    check(true, "access token", mode === "gcloud" ? `impersonating ${config.serviceAccount}` : mode);
  } catch (error) {
    check(false, "access token", error.message.split("\n")[0], error.message.split("\n").slice(1).join(" "));
  }
  const publisherId = normalizePublisherId(options.publisherId || process.env.CWS_PUBLISHER_ID || config.publisherId);
  check(Boolean(publisherId), "publisher ID", publisherId || "missing", "`setup --publisher-id <ID from the dashboard URL>`");

  const root = resolveRoot(options.dir);
  const local = loadLocalConfig(root);
  const extensionId = normalizeExtensionId(options.extensionId || local.extensionId);
  if (fs.existsSync(path.join(root, "manifest.json")) || local.extensionId) {
    if (check(EXTENSION_ID_RE.test(extensionId), "extension ID", extensionId || "not bound", `\`bind ${options.dir || "."} --extension-id <ID>\``) && token && publisherId) {
      try {
        const store = summarizeStatus(await createClient({ token, publisherId: local.publisherId || publisherId, extensionId }).fetchStatus());
        check(true, "store access", describeStore(store));
      } catch (error) {
        check(false, "store access", `HTTP ${error.status || "?"}`, explainError(error, { mode, serviceAccount: config.serviceAccount, publisherId, extensionId }).split("\n").slice(2).join("\n       "));
      }
    }
  } else {
    out.line("       (not in an extension folder — pass one to also test item access)");
  }
  const ok = checks.every((item) => item.ok);
  return { code: ok ? EXIT.ok : EXIT.error, result: { checks } };
}

// ---------- main ----------

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(EXIT.error);
  }
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  out.json = Boolean(options.json);
  const handlers = {
    publish: cmdPublish, preflight: cmdPublish, submit: cmdSubmit, status: cmdStatus, scan: cmdScan,
    pack: cmdPack, cancel: cmdCancel, rollout: cmdRollout, bind: cmdBind, setup: cmdSetup, doctor: cmdDoctor,
  };
  let code = EXIT.ok;
  let result = null;
  let message = "";
  try {
    ({ code, result } = await handlers[options.command](options));
  } catch (error) {
    code = error instanceof Stop ? error.code : EXIT.error;
    result = error.result || null;
    message = error.message;
    out.line(`  => ${code === EXIT.error ? "error" : "stopped"}: ${message}`);
  }
  if (options.json) {
    const strip = (value) => JSON.parse(JSON.stringify(value ?? null, (key, inner) => (key === "token" ? undefined : inner)));
    process.stdout.write(`${JSON.stringify({ command: options.command, exitCode: code, error: message || undefined, ...strip(result) }, null, 2)}\n`);
  }
  process.exitCode = code;
}

main();
