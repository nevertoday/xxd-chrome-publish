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

const localizedFiles = (locales) => Object.fromEntries(locales.map((locale) => [
  `_locales/${locale}/messages.json`, { appName: { message: `Name ${locale}` }, appDesc: { message: `Summary ${locale}` } },
]));
const localizedManifest = (overrides = {}) => baseManifest({ name: "__MSG_appName__", description: "__MSG_appDesc__", default_locale: "en", ...overrides });
function setupLocalizedItem(version, locales) {
  setupItem({ storeManifest: localizedManifest({ version }) });
  const extra = Object.fromEntries(Object.entries(localizedFiles(locales)).map(([name, json]) => [name, JSON.stringify(json)]));
  store.items[EXT_ID].crx = makeCrx(localizedManifest({ version }), extra);
}

test("multi-language: listing pages are a required check once, then only for new languages", async () => {
  setupLocalizedItem("1.0.0", ["en", "ja"]);
  const dir = extension(localizedFiles(["en", "ja"]), localizedManifest());
  const stopped = await run([], dir);
  assert.equal(stopped.code, 3, stopped.stdout + stopped.stderr);
  assert.equal(store.calls("upload").length, 0);
  assert.match(stopped.stdout, /\[required\] Check the store listing in these 2 languages: en, ja/);
  assert.match(stopped.stdout, /ja\s+Name ja — Summary ja/);
  assert.match(stopped.stdout, /edit\/listing/);
  assert.match(stopped.stdout, /✗ dashboard\s+NOT done/);

  const ok = await run(["--dashboard-ready"], dir);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(dir, ".chrome-publish.json")));
  assert.deepEqual(config.listingLocales, ["en", "ja"]);
  assert.match(ok.stdout, /✓ dashboard\s+1 required item — you confirmed/);
  assert.match(ok.stdout, /✓ package\s+uploaded 1\.0\.1/);
  assert.match(ok.stdout, /✓ review\s+submitted — PENDING_REVIEW \(not live until Google approves it\)/);

  setupLocalizedItem("1.0.1", ["en", "ja"]);
  const again = await run(["preflight"], dir);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /READY to publish/);

  writeTree(dir, localizedFiles(["ko"]));
  const added = await run(["preflight"], dir);
  assert.equal(added.code, 3, added.stdout);
  assert.match(added.stdout, /this language: ko — .*new since the published version: ko/);
});

test("a locale that would break loading stops before upload", async () => {
  setupItem();
  const dir = extension({ "_locales/en/messages.json": { appName: { message: "x" } } }, localizedManifest());
  const result = await run([], dir);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /appDesc/);
  assert.equal(store.calls("upload").length, 0);
});

test("first release under a new ID: allow-lists, test account and support page come first", async () => {
  setupItem({ status: {} });
  store.items[EXT_ID].crx = null;
  const manifest = baseManifest({ permissions: ["storage", "identity"] });
  const dir = extension({
    "background.js": 'chrome.identity.launchWebAuthFlow({ url: "https://auth.example.com/?redirect=https://ponmlkjihgfedcbaponmlkjihgfedcba.chromiumapp.org/" });',
  }, manifest);
  const result = await run([], dir);
  assert.equal(result.code, 3, result.stdout + result.stderr);
  assert.equal(store.calls("upload").length, 0);
  assert.match(result.stdout, /First release under abcdefghijklmnopabcdefghijklmnop/);
  assert.match(result.stdout, /abcdefghijklmnopabcdefghijklmnop\.chromiumapp\.org/);
  assert.match(result.stdout, /background\.js:1/, "points at the old ID in the code");
  assert.match(result.stdout, /test account/);
  assert.match(result.stdout, /no homepage_url/);

  const ok = await run(["--dashboard-ready"], dir);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(store.calls("upload").length, 1);
});

test("--json reports the three stages separately", async () => {
  setupItem({ publishError: "Your submission does not meet the requirements to be published in the store." });
  const result = await run(["--json"], extension());
  const json = JSON.parse(result.stdout);
  assert.equal(json.stages.uploaded.done, true);
  assert.equal(json.stages.review.done, false);
  assert.equal(json.stages.dashboard.done, false, "a refused submission means the dashboard is missing something");
  assert.match(json.report, /Uploaded, but the submission was refused/);
});

test("REPORT block: Chinese, three stages, every to-do with paste text, the exact next command", async () => {
  setupItem();
  const manifest = baseManifest({ permissions: ["storage", "identity"] });
  const dir = extension({ "background.js": "chrome.identity.launchWebAuthFlow({ url });" }, manifest);
  const result = await run(["preflight", "--lang", "zh"], dir);
  const report = result.stdout.slice(result.stdout.indexOf("======== REPORT"));
  assert.match(report, /结论：还没上传：后台有 1 项必须先做/);
  assert.match(report, /- 后台资料已保存：否\n- 安装包已上传：否\n- 已提交审核：否/);
  assert.match(report, /\[权限说明\] 为新增的 "identity" 权限写用途说明/);
  assert.match(report, /chrome\.identity\.launchWebAuthFlow opens Chrome's sign-in window/);
  assert.match(report, /\[数据用途\]/, "advice items are kept, not just required ones");
  assert.match(report, /publish .* --dashboard-ready/);
  assert.ok(!/发布完成/.test(report.replace("不等于“发布完成”", "")));
});

test("REPORT block: a never-listed item is handed to the first-listing workflow", async () => {
  store.requests.length = 0;
  delete store.items[EXT_ID];
  const result = await run(["--lang", "zh"], extension());
  assert.equal(result.code, 1);
  assert.match(result.stdout, /结论：失败：商店里找不到这个插件/);
  assert.match(result.stdout, /cx-chrome-store-submission/);
  assert.match(result.stdout, /三个阶段（分开看，不等于“发布完成”）：都没有发生/);
});

test("REPORT block after a successful publish never says published", async () => {
  setupItem();
  const result = await run(["--lang", "zh"], extension());
  assert.match(result.stdout, /结论：已上传并提交审核，状态 PENDING_REVIEW。Google 审核通过前，用户看不到新版本/);
  assert.match(result.stdout, /- 已提交审核：是 \(PENDING_REVIEW\)/);
});

