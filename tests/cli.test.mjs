// End-to-end: the CLI against a fake store. Each case is a situation met in real use.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readZip } from "../scripts/lib/zip.mjs";
import {
  startMockStore, runCli, tempDir, writeTree, baseManifest, makeCrx, published, EXT_ID, PUBLISHER,
} from "./helpers.mjs";

let store;
before(async () => {
  store = await startMockStore();
});
after(() => store.close());

function setupItem({ storeManifest = baseManifest(), status, publishError } = {}) {
  store.requests.length = 0;
  store.items[EXT_ID] = {
    status: status || { publishedItemRevisionStatus: published(storeManifest.version) },
    crx: makeCrx(storeManifest),
    publishError,
  };
  return store.items[EXT_ID];
}

function extension(files = {}, manifest = baseManifest()) {
  return writeTree(tempDir(), {
    "manifest.json": manifest,
    "background.js": "chrome.storage.local.get();",
    ".chrome-publish.json": { extensionId: EXT_ID },
    ...files,
  });
}

const run = (args, dir, extra = {}) => runCli([...args, "--output-dir", tempDir("xcp-out-")], { store, cwd: dir, ...extra });
const manifestVersion = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))).version;

test("publish: bump, package, upload, submit, record the version", async () => {
  setupItem();
  const dir = extension({ "package.json": { name: "x", version: "1.0.0" } });
  const result = await run([], dir);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(store.calls("upload").length, 1);
  assert.equal(store.calls("publish").length, 1);
  const zip = readZip(store.items[EXT_ID].uploaded);
  assert.equal(JSON.parse(zip.read("manifest.json")).version, "1.0.1");
  assert.equal(manifestVersion(dir), "1.0.1");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "package.json"))).version, "1.0.1");
  assert.match(result.stdout, /submitted for review/);
});

test("a new permission stops before upload and shows where it is used", async () => {
  setupItem();
  const manifest = baseManifest({ permissions: ["storage", "identity"] });
  const dir = extension({ "auth.js": "export const go = () => chrome.identity.launchWebAuthFlow({ url });", "background.js": 'import "./auth.js";' }, manifest);
  const result = await run([], dir);
  assert.equal(result.code, 3, result.stdout + result.stderr);
  assert.equal(store.calls("upload").length, 0);
  assert.equal(manifestVersion(dir), "1.0.0", "source untouched when stopped");
  assert.match(result.stdout, /Justify the new "identity" permission/);
  assert.match(result.stdout, /auth\.js:1/);
  assert.match(result.stdout, /edit\/privacy/);

  const again = await run(["--dashboard-ready"], dir);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.equal(store.calls("upload").length, 1);
  assert.equal(manifestVersion(dir), "1.0.1");
});

test("a submission in review blocks; --cancel-pending withdraws it first", async () => {
  setupItem({
    status: { publishedItemRevisionStatus: published("1.0.0"), submittedItemRevisionStatus: published("1.0.1", "PENDING_REVIEW") },
  });
  const dir = extension();
  const blocked = await run([], dir);
  assert.equal(blocked.code, 2);
  assert.equal(store.calls("upload").length, 0);
  assert.match(blocked.stdout, /still in review/);

  const forced = await run(["--cancel-pending"], dir);
  assert.equal(forced.code, 0, forced.stdout + forced.stderr);
  assert.equal(store.calls("cancelSubmission").length, 1);
  // 1.0.1 was taken by the withdrawn submission's slot in the plan made before cancelling
  assert.equal(manifestVersion(dir), "1.0.2");
});

test("store ahead of the local source bumps from the store", async () => {
  setupItem({ storeManifest: baseManifest({ version: "1.0.5" }) });
  const dir = extension();
  const result = await run([], dir);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(manifestVersion(dir), "1.0.6");
  assert.match(result.stdout, /ahead of local/);
});

test("rejected publish keeps the upload; submit sends it without re-uploading", async () => {
  const item = setupItem({ publishError: "Your submission does not meet the requirements to be published in the store." });
  const dir = extension();
  const result = await run([], dir);
  assert.equal(result.code, 3);
  assert.match(result.stdout, /Submit for review/);
  assert.match(result.stdout, /`submit` command/);
  assert.equal(manifestVersion(dir), "1.0.1", "uploaded version is recorded even though submit failed");

  delete item.publishError;
  store.requests.length = 0;
  const submit = await run(["submit"], dir);
  assert.equal(submit.code, 0, submit.stdout + submit.stderr);
  assert.equal(store.calls("upload").length, 0);
  assert.equal(store.calls("publish").length, 1);
});

test("build runs first; a failing build uploads nothing", async () => {
  setupItem();
  const manifest = baseManifest({ background: { service_worker: "build/bg.js" } });
  const files = {
    "build.js": 'require("fs").mkdirSync("build",{recursive:true}); require("fs").writeFileSync("build/bg.js","fresh")',
    "package.json": { scripts: { build: "node build.js" } },
  };
  const dir = extension(files, manifest);
  const ok = await run([], dir);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(readZip(store.items[EXT_ID].uploaded).read("build/bg.js").toString(), "fresh");

  setupItem();
  const broken = extension({ ...files, "build.js": "process.exit(3)" }, manifest);
  const failed = await run([], broken);
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /build failed/);
  assert.equal(store.calls("upload").length, 0);
});

test("a manifest pointing at a missing file is refused", async () => {
  setupItem();
  const dir = extension({}, baseManifest({ content_scripts: [{ matches: ["https://a.com/*"], js: ["gone.js"] }] }));
  const result = await run([], dir);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /gone\.js/);
  assert.equal(store.calls("upload").length, 0);
});

test("preflight has no side effects and reports a verdict", async () => {
  setupItem();
  const dir = extension();
  const before = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
  const result = await run(["preflight"], dir);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /READY to publish/);
  assert.equal(store.calls("upload").length + store.calls("publish").length, 0);
  assert.equal(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"), before);
});

test("preflight still reports when a submission is in review", async () => {
  setupItem({
    status: { publishedItemRevisionStatus: published("1.0.0"), submittedItemRevisionStatus: published("1.0.1", "PENDING_REVIEW") },
  });
  const result = await run(["preflight"], extension());
  assert.equal(result.code, 2);
  assert.match(result.stdout, /BLOCKED/);
  assert.match(result.stdout, /package/);
});

test("--json keeps stdout parseable and never includes a token", async () => {
  setupItem();
  const result = await run(["preflight", "--json"], extension());
  const json = JSON.parse(result.stdout);
  assert.equal(json.command, "preflight");
  assert.equal(json.version.to, "1.0.1");
  assert.ok(!result.stdout.includes("test-token"));
  assert.ok(!result.stderr.includes("test-token"));
});

test("wrong credentials explain the service-account field", async () => {
  setupItem();
  const result = await run(["status"], extension(), { env: { CWS_ACCESS_TOKEN: "bad" } });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /HTTP 403/);
});

test("scan lists bound extensions with a next step", async () => {
  setupItem();
  const base = tempDir();
  writeTree(base, {
    "a/manifest.json": baseManifest(),
    "a/background.js": "",
    "a/.chrome-publish.json": { extensionId: EXT_ID },
    "b/manifest.json": baseManifest({ version: "2.0.0" }),
    "b/background.js": "",
    "b/.chrome-publish.json": { extensionId: EXT_ID },
    "b/node_modules/c/manifest.json": baseManifest(),
    "b/node_modules/c/.chrome-publish.json": { extensionId: EXT_ID },
  });
  const result = await runCli(["scan", base, "--json"], { store });
  assert.equal(result.code, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.extensions.map((row) => row.dir), ["a", "b"]);
  assert.equal(json.extensions[1].next, "local version ahead — publish");
});

test("bind accepts a store URL; setup migrates nothing it shouldn't", async () => {
  const dir = writeTree(tempDir(), { "manifest.json": baseManifest() });
  const result = await runCli(["bind", dir, "--extension-id", `https://chromewebstore.google.com/detail/x/${EXT_ID}`], { store });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, ".chrome-publish.json"))).extensionId, EXT_ID);

  const configDir = tempDir();
  const setup = await runCli(["setup", "--publisher-id", `https://chrome.google.com/webstore/devconsole/${PUBLISHER}`], { store, configDir });
  assert.equal(setup.code, 0, setup.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(configDir, "config.json"))).publisherId, PUBLISHER);
});

test("legacy flags still work (--status, --dry-run)", async () => {
  setupItem();
  const dir = extension();
  const status = await run(["--status"], dir);
  assert.equal(status.code, 0, status.stderr);
  assert.match(status.stdout, /PUBLISHED 1\.0\.0/);
  const pack = await run(["--dry-run"], dir);
  assert.equal(pack.code, 0, pack.stderr);
  assert.equal(store.calls("upload").length, 0);
});
