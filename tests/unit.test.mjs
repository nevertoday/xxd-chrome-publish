import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { planVersion, compareVersions, bumpVersion, isValidVersion } from "../scripts/lib/version.mjs";
import { createZip, readZip, crxToZip } from "../scripts/lib/zip.mjs";
import { collectFiles, packageExtension, setManifestVersionText, globToRegExp, isLicenseFile, displayName, viewerLocales } from "../scripts/lib/packager.mjs";
import { localeInfo, listingActions, folderReader } from "../scripts/lib/locales.mjs";
import { findForeignExtensionIds } from "../scripts/lib/first-release.mjs";
import { diffManifests, dashboardActions, findPermissionUsage } from "../scripts/lib/manifest-diff.mjs";
import { normalizeExtensionId, normalizePublisherId, projectCommands } from "../scripts/lib/project.mjs";
import { tempDir, writeTree, baseManifest, makeCrx } from "./helpers.mjs";

// ---------- versions ----------

test("version validation and ordering", () => {
  assert.ok(isValidVersion("1.2.3.4"));
  assert.ok(!isValidVersion("1.2.3.4.5"));
  assert.ok(!isValidVersion("1.02"));
  assert.ok(!isValidVersion("70000"));
  assert.equal(compareVersions("1.10", "1.9"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(bumpVersion("1.2"), "1.2.1");
  assert.equal(bumpVersion("1.2.3.4", "minor"), "1.3.0.0");
});

test("plan: plain bump when local equals the store", () => {
  assert.deepEqual(planVersion({ local: "1.0.76", storeVersions: ["1.0.76"] }).version, "1.0.77");
});

test("plan: store ahead of local bumps from the store", () => {
  const plan = planVersion({ local: "1.0.0", storeVersions: ["1.0.1"] });
  assert.equal(plan.version, "1.0.2");
  assert.equal(plan.reason, "store-ahead");
});

test("plan: local already ahead is not bumped again (rerun after a stop)", () => {
  const plan = planVersion({ local: "1.0.28", storeVersions: ["1.0.27"] });
  assert.equal(plan.version, "1.0.28");
  assert.equal(plan.reason, "local-ahead");
});

test("plan: in-review version counts as taken", () => {
  assert.equal(planVersion({ local: "0.1.63", storeVersions: ["0.1.62", "0.1.63"] }).version, "0.1.64");
});

test("plan: explicit and kept versions must clear the store", () => {
  assert.match(planVersion({ local: "1.0.0", storeVersions: ["1.0.1"], setVersion: "1.0.1" }).error, /not above/);
  assert.match(planVersion({ local: "1.0.1", storeVersions: ["1.0.1"], noBump: true }).error, /already has/);
  assert.equal(planVersion({ local: "1.0.0", storeVersions: ["1.0.1"], setVersion: "2.0" }).version, "2.0");
  assert.equal(planVersion({ local: "1.0.0", storeVersions: [] }).version, "1.0.1");
});

// ---------- zip ----------

test("zip round trip, including UTF-8 names and stored entries", () => {
  const big = Buffer.from("a".repeat(5000));
  const tiny = Buffer.from([1, 2, 3]);
  const zip = createZip([
    { name: "manifest.json", data: Buffer.from('{"name":"x"}') },
    { name: "图片/大.txt", data: big },
    { name: "t.bin", data: tiny },
  ]);
  const read = readZip(zip);
  assert.deepEqual(read.names().sort(), ["manifest.json", "t.bin", "图片/大.txt"].sort());
  assert.deepEqual(read.read("图片/大.txt"), big);
  assert.deepEqual(read.read("t.bin"), tiny);
  assert.equal(read.read("missing"), null);
});

test("crx3 header is stripped", () => {
  const crx = makeCrx({ name: "x", version: "1" });
  assert.equal(JSON.parse(readZip(crxToZip(crx)).read("manifest.json")).version, "1");
});

test("system unzip can read our archives", { skip: !fs.existsSync("/usr/bin/unzip") }, async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = tempDir();
  const file = path.join(dir, "a.zip");
  fs.writeFileSync(file, createZip([{ name: "dir/中文.js", data: Buffer.from("x".repeat(300)) }]));
  const output = execFileSync("/usr/bin/unzip", ["-t", file], { encoding: "utf8" });
  assert.match(output, /No errors detected/);
});

// ---------- packager ----------

function lazyInjectExtension() {
  return writeTree(tempDir(), {
    "manifest.json": baseManifest({
      background: { service_worker: "build/background.js" },
      action: { default_popup: "popup.html" },
      icons: { 128: "icons/128.png" },
      default_locale: "en",
      content_scripts: [{ matches: ["https://example.com/*"], js: ["build/content.js"] }],
    }),
    "_locales/en/messages.json": { name: { message: "Lazy" } },
    "icons/128.png": "png",
    "build/background.js":
      'const LAZY = { panel: ["marked.min.js", "build/content-panel.js"], note: ["build/content-quick-note.js"] };\n' +
      'chrome.scripting.executeScript({ target: { tabId: 1 }, files: ["build/sidebar.js"] });\n',
    "build/content.js": "console.log('content');",
    "build/content-panel.js": "panel",
    "build/content-quick-note.js": "note",
    "build/sidebar.js": "sidebar",
    "build/unused.js": "not referenced",
    "marked.min.js": "lib",
    "popup.html": '<link href="popup.css" rel="stylesheet"><script src="popup.js"></script>',
    "popup.css": "body { background: url(img/bg.png) }",
    "img/bg.png": "png",
    "popup.js": 'import { x } from "./shared/util.js"; new Audio(chrome.runtime.getURL("sounds/rain.opus"));',
    "shared/util.js": "export const x = 1;",
    "sounds/rain.opus": "opus",
    "src/background/index.js": "source, not shipped",
    "tests/setup.js": "test",
    "vitest.config.js": 'export default { setupFiles: ["tests/setup.js"] }',
    "package.json": { name: "lazy", scripts: { build: "node build.js" } },
    "README.md": "readme",
  });
}

test("collector follows lazy-inject maps, executeScript files, html/css/js references", () => {
  const dir = lazyInjectExtension();
  const { files, missing } = collectFiles(dir, JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))));
  assert.deepEqual(missing, []);
  for (const expected of [
    "build/content-panel.js", "build/content-quick-note.js", "build/sidebar.js", "marked.min.js",
    "popup.css", "img/bg.png", "shared/util.js", "sounds/rain.opus", "_locales/en/messages.json", "icons/128.png",
  ]) {
    assert.ok(files.includes(expected), `missing ${expected}`);
  }
  for (const unexpected of ["build/unused.js", "src/background/index.js", "tests/setup.js", "vitest.config.js", "package.json", "README.md"]) {
    assert.ok(!files.includes(unexpected), `should not ship ${unexpected}`);
  }
});

test("collector reports manifest references that don't exist", () => {
  const dir = writeTree(tempDir(), {
    "manifest.json": baseManifest({ background: { service_worker: "build/background.js" } }),
  });
  const { missing } = collectFiles(dir, JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))));
  assert.deepEqual(missing, [{ from: "background.service_worker", ref: "build/background.js", severity: "error" }]);
});

test("include and exclude globs", () => {
  const dir = lazyInjectExtension();
  writeTree(dir, { "extra/data/a.json": "{}" });
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
  const { files } = collectFiles(dir, manifest, { include: ["extra/**"], exclude: ["sounds/**", "img"] });
  assert.ok(files.includes("extra/data/a.json"));
  assert.ok(!files.includes("sounds/rain.opus"));
  assert.ok(!files.includes("img/bg.png"));
  assert.ok(globToRegExp("**/*.map").test("a/b/c.js.map"));
  assert.ok(globToRegExp("*.map").test("x.map"));
  assert.ok(!globToRegExp("*.map").test("a/x.map"));
});

test("packageExtension writes the version into the ZIP only", () => {
  const dir = lazyInjectExtension();
  const before = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
  const out = tempDir();
  const result = packageExtension(dir, { version: "1.0.1", outputDir: out });
  assert.equal(path.basename(result.zipPath), "Test Extension v1.0.1.zip");
  assert.equal(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"), before);
  const zip = readZip(fs.readFileSync(result.zipPath));
  assert.equal(JSON.parse(zip.read("manifest.json")).version, "1.0.1");
});

test("the ZIP carries the store name the user sees: their language first, then default_locale", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "__MSG_extName__", version: "2.0.0", default_locale: "en" }));
  for (const [locale, name] of [["en", "XXD Poster - Markdown to X"], ["zh_CN", "小小东 · Poster - Markdown 写进 X"]]) {
    fs.mkdirSync(path.join(dir, "_locales", locale), { recursive: true });
    fs.writeFileSync(path.join(dir, "_locales", locale, "messages.json"), JSON.stringify({ extName: { message: name } }));
  }
  assert.deepEqual(viewerLocales({ LANG: "zh_CN.UTF-8" }), ["zh_CN", "zh"]);
  assert.deepEqual(viewerLocales({ XXD_CHROME_PUBLISH_LANG: "zh", LANG: "en_US.UTF-8" }), ["zh_CN", "zh"]);
  const zh = packageExtension(dir, { outputDir: tempDir(), locales: ["zh_CN", "zh"] });
  assert.equal(path.basename(zh.zipPath), "小小东 · Poster - Markdown 写进 X v2.0.0.zip");
  assert.equal(zh.name, "小小东 · Poster - Markdown 写进 X");
  const fr = packageExtension(dir, { outputDir: tempDir(), locales: ["fr_FR", "fr"] });
  assert.equal(path.basename(fr.zipPath), "XXD Poster - Markdown to X v2.0.0.zip");
  assert.equal(displayName(dir, { name: "A/B: C", default_locale: "en" }, []), "A/B: C");
});

test("version text replacement keeps formatting", () => {
  const text = '{\n    "name": "x",\n    "version": "1.0.0",\n    "nested": { "version": "9" }\n}\n';
  assert.equal(setManifestVersionText(text, "1.0.1"), text.replace('"1.0.0"', '"1.0.1"'));
});

// ---------- manifest diff ----------

test("diff finds new permissions, hosts (incl. MV2 and content scripts) and renames", () => {
  const store = { manifest_version: 3, name: "A", permissions: ["storage", "scripting"], host_permissions: ["https://a.com/*"] };
  const local = {
    manifest_version: 3,
    name: "B",
    permissions: ["storage", "scripting", "identity", "https://legacy.com/*"],
    host_permissions: ["https://a.com/*"],
    content_scripts: [{ matches: ["https://x.com/*"], js: ["c.js"] }],
    optional_permissions: ["downloads"],
  };
  const diff = diffManifests(store, local);
  assert.deepEqual(diff.newPermissions, ["identity"]);
  assert.deepEqual(diff.newOptionalPermissions, ["downloads"]);
  assert.deepEqual(diff.newHosts.sort(), ["https://legacy.com/*", "https://x.com/*"]);
  const actions = dashboardActions(diff);
  assert.equal(actions.filter((action) => action.blocking).length, 3); // identity, downloads, hosts
  assert.ok(actions.some((action) => /data-usage/.test(action.title)));
  assert.ok(actions.some((action) => action.tab === "listing"));
});

test("no store manifest means no actions", () => {
  assert.deepEqual(dashboardActions(diffManifests(null, { permissions: ["identity"] })), []);
});

test("usage finder points at real calls, even in minified lines", () => {
  const dir = writeTree(tempDir(), {
    "a.js": `${"x".repeat(5000)};chrome.identity.launchWebAuthFlow({url})`,
    "b.js": "// nothing",
  });
  const hits = findPermissionUsage(dir, ["a.js", "b.js"], "identity");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].file, "a.js");
  assert.ok(hits[0].snippet.length < 200);
  assert.deepEqual(findPermissionUsage(dir, ["a.js"], "activeTab"), []);
});

// ---------- project ----------

test("ID normalisation accepts store and dashboard URLs", () => {
  assert.equal(
    normalizeExtensionId("https://chromewebstore.google.com/detail/xposter/iimkimodgdjnnmdopeolboakhjmhfbbj?hl=zh"),
    "iimkimodgdjnnmdopeolboakhjmhfbbj",
  );
  assert.equal(normalizePublisherId("https://chrome.google.com/webstore/devconsole/1a2b3c4d-0000/settings"), "1a2b3c4d-0000");
});

test("build/check detection honours overrides and package managers", () => {
  const dir = writeTree(tempDir(), {
    "package.json": { scripts: { build: "x", check: "y", test: "z" } },
    "pnpm-lock.yaml": "",
  });
  assert.deepEqual(projectCommands(dir, {}), { build: "pnpm run build", check: "pnpm run check" });
  assert.deepEqual(projectCommands(dir, { check: false, build: "make" }), { build: "make", check: "" });
  assert.deepEqual(projectCommands(tempDir(), {}), { build: "", check: "" });
});

test("usage finder falls back to wrapped chrome globals", () => {
  const dir = writeTree(tempDir(), {
    "account.js": "if (chromeApi?.identity?.launchWebAuthFlow && x) { await chromeApi.identity.launchWebAuthFlow({ url }); }",
  });
  const hits = findPermissionUsage(dir, ["account.js"], "identity");
  assert.equal(hits.length, 1);
  assert.ok(hits[0].loose);
});

test("missing web-accessible resources warn; missing service workers are errors", () => {
  const dir = writeTree(tempDir(), {
    "manifest.json": baseManifest({ web_accessible_resources: [{ resources: ["data/x.json"], matches: ["<all_urls>"] }] }),
    "background.js": "",
  });
  const { missing } = collectFiles(dir, JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))));
  assert.deepEqual(missing, [{ from: "web_accessible_resources", ref: "data/x.json", severity: "warning" }]);
});

// ---------- licences ----------

test("licence names: root files, per-library files, bundler output; not runtime files", () => {
  for (const name of ["LICENSE", "LICENSE.md", "LICENCE.txt", "COPYING", "NOTICE", "qrcode.LICENSE",
    "bundle.js.LICENSE.txt", "THIRD_PARTY_NOTICES.txt", "LICENSE-MIT", "vendor/pdf.NOTICE"]) {
    assert.ok(isLicenseFile(name), name);
  }
  for (const name of ["notice.js", "license.html", "license-badge.png", "licensing.js", "README.md", "noticeboard.txt"]) {
    assert.ok(!isLicenseFile(name), name);
  }
});

test("packager ships licences nothing references (the vendor/*.LICENSE that went missing)", () => {
  const dir = writeTree(tempDir(), {
    "manifest.json": baseManifest(),
    "background.js": 'importScripts("vendor/qrcode.min.js", "lib/notice.js"); chrome.scripting.executeScript({ files: ["dist/bundle.js"] });',
    "LICENSE": "MIT",
    "vendor/qrcode.min.js": "!function(){}",
    "vendor/qrcode.LICENSE": "MIT qrcode",
    "lib/notice.js": "export {}",
    "lib/unused-notice.js": "export {}",
    "dist/bundle.js": "x",
    "dist/bundle.js.LICENSE.txt": "/*! react */",
    "docs/LICENSE-docs": "CC",
    "tmp/profile/LICENSE": "chrome profile junk",
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
  const { files, licenses, unlicensed } = collectFiles(dir, manifest);
  for (const expected of ["LICENSE", "vendor/qrcode.LICENSE", "dist/bundle.js.LICENSE.txt", "lib/notice.js"]) {
    assert.ok(files.includes(expected), `missing ${expected}`);
  }
  for (const unexpected of ["lib/unused-notice.js", "docs/LICENSE-docs", "tmp/profile/LICENSE"]) {
    assert.ok(!files.includes(unexpected), `should not ship ${unexpected}`);
  }
  assert.deepEqual(licenses, ["LICENSE", "dist/bundle.js.LICENSE.txt", "vendor/qrcode.LICENSE"]);
  assert.deepEqual(unlicensed, []);
});

test("packager follows template-literal paths (the core/i18n/${lang}.js that went missing)", () => {
  const dir = writeTree(tempDir(), {
    "manifest.json": baseManifest(),
    "background.js": [
      "importScripts(...langs.map((lang) => `core/i18n/${lang}.js`));",
      "chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html?file=${encodeURIComponent(p)}`) });",
    ].join("\n"),
    "core/i18n/en.js": "",
    "core/i18n/zh-TW.js": "",
    "core/i18n/notes.txt": "",
    "editor/editor.html": '<script src="editor.js"></script>',
    "editor/editor.js": "",
    "editor/unused.js": "",
  });
  const { files } = collectFiles(dir, JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))));
  for (const expected of ["core/i18n/en.js", "core/i18n/zh-TW.js", "editor/editor.html", "editor/editor.js"]) {
    assert.ok(files.includes(expected), `missing ${expected}`);
  }
  for (const unexpected of ["core/i18n/notes.txt", "editor/unused.js"]) {
    assert.ok(!files.includes(unexpected), `should not ship ${unexpected}`);
  }
});

test("third-party files without a licence are reported; a header comment counts", () => {
  const dir = writeTree(tempDir(), {
    "manifest.json": baseManifest(),
    "background.js": 'importScripts("lib/sortable.min.js", "lib/lunar.min.js", "lib/fflate.min.js");',
    "lib/sortable.min.js": "!function(){}",
    "lib/lunar.min.js": "/*! lunar.js | (c) 2020 6tail | MIT */!function(){}",
    "lib/fflate.min.js": "x",
    "lib/fflate.LICENSE": "MIT",
  });
  const { unlicensed } = collectFiles(dir, JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))));
  assert.deepEqual(unlicensed, ["lib/sortable.min.js"]);
});

test("build output gets the project's licence and bundled dependencies' licences", () => {
  const project = writeTree(tempDir(), {
    "LICENSE": "MIT project",
    "NOTICE.md": "notice",
    "package.json": { dependencies: { marked: "1", "@scope/ui": "1" }, devDependencies: { vitest: "1" } },
    "node_modules/marked/LICENSE.md": "MIT marked",
    "node_modules/@scope/ui/LICENSE": "MIT ui",
    "node_modules/vitest/LICENSE": "dev only",
    "dist/manifest.json": baseManifest(),
    "dist/background.js": "",
  });
  const result = packageExtension(path.join(project, "dist"), { outputDir: tempDir(), projectRoot: project, bundled: true });
  assert.deepEqual(result.licenses, ["LICENSE", "NOTICE.md", "licenses/marked/LICENSE.md", "licenses/scope-ui/LICENSE"]);
  const zip = readZip(fs.readFileSync(result.zipPath));
  assert.equal(zip.read("licenses/marked/LICENSE.md").toString(), "MIT marked");
  assert.equal(zip.read("LICENSE").toString(), "MIT project");

  const unbundled = packageExtension(path.join(project, "dist"), { outputDir: tempDir(), projectRoot: project, bundled: false });
  assert.deepEqual(unbundled.licenses, ["LICENSE", "NOTICE.md"]);
});

// ---------- languages ----------

function localized(messages, manifest = {}) {
  const files = { "manifest.json": baseManifest({ name: "__MSG_appName__", description: "__MSG_appDesc__", default_locale: "en", ...manifest }) };
  for (const [locale, entries] of Object.entries(messages)) {
    files[`_locales/${locale}/messages.json`] = Object.fromEntries(Object.entries(entries).map(([key, message]) => [key, { message }]));
  }
  const dir = writeTree(tempDir(), files);
  return localeInfo(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))), folderReader(dir));
}

test("locale info resolves name/summary per language and flags fallbacks and load errors", () => {
  const info = localized({
    en: { appName: "Saver", appDesc: "Save pages" },
    ja: { appName: "セーバー" },
    zh_CN: { APPNAME: "保存器", appDesc: "保存网页" },
  });
  assert.deepEqual(info.locales.map((entry) => entry.locale), ["en", "ja", "zh_CN"]);
  assert.equal(info.locales[2].name, "保存器", "message names are case-insensitive");
  assert.equal(info.locales[1].description, "Save pages", "ja falls back to en");
  assert.ok(info.problems.some((problem) => problem.locale === "ja" && problem.severity === "warning" && /falls back/.test(problem.text)));

  const broken = localized({ en: { appName: "Saver" } });
  assert.ok(broken.problems.some((problem) => problem.severity === "error" && /appDesc/.test(problem.text)));

  const long = localized({ en: { appName: "Saver", appDesc: "x".repeat(140) } });
  assert.ok(long.problems.every((problem) => problem.severity === "warning"), "length limits warn — the store has accepted longer");
});

test("listing check: every language once, then only new ones", () => {
  const info = localized({ en: { appName: "A", appDesc: "a" }, de: { appName: "B", appDesc: "b" } });
  const first = listingActions(info, null, []);
  assert.equal(first.length, 1);
  assert.ok(first[0].blocking);
  assert.deepEqual(first[0].locales.map((entry) => entry.locale), ["en", "de"]);

  assert.deepEqual(listingActions(info, null, ["en", "de"]), []);

  const store = localized({ en: { appName: "A", appDesc: "a" } });
  const added = listingActions(info, store, ["en", "de"]);
  assert.ok(added[0].blocking, "a language the published package lacked has an empty page, even if confirmed");
  assert.match(added[0].title, /new since the published version: de/);

  const changedStore = localized({ en: { appName: "A", appDesc: "old" }, de: { appName: "B", appDesc: "b" } });
  const changed = listingActions(info, changedStore, ["en", "de"]);
  assert.deepEqual(changed.map((action) => action.blocking), [false]);
  assert.match(changed[0].title, /changed in en/);

  assert.deepEqual(listingActions(localeInfo(baseManifest(), folderReader(tempDir())), null, []), [], "single-language items aren't gated");
});

test("other extensions' IDs in the code are found; the own ID is not", () => {
  const own = "abcdefghijklmnopabcdefghijklmnop";
  const dir = writeTree(tempDir(), {
    "a.js": `const self = "${own}"; const redirect = "https://ponmlkjihgfedcbaponmlkjihgfedcba.chromiumapp.org/";`,
    "b.js": "const notAnId = 'abcdefghijklmnopabcdefghijklmnopq';",
  });
  const hits = findForeignExtensionIds(dir, ["a.js", "b.js"], own);
  assert.deepEqual(hits.map((hit) => [hit.file, hit.id]), [["a.js", "ponmlkjihgfedcbaponmlkjihgfedcba"]]);
});
