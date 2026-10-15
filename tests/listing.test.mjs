import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { collectFiles } from "../scripts/lib/packager.mjs";
import { listingFacts, listingLanguages, normalizeLocale, guessLanguage, isRtl, missingFromPackage } from "../scripts/lib/listing.mjs";
import { encodeRgb } from "../scripts/lib/visuals/png.mjs";
import { tempDir, writeTree, baseManifest, runCli } from "./helpers.mjs";

function fixture(manifestOverrides = {}, extra = {}) {
  return writeTree(tempDir(), {
    "manifest.json": baseManifest({
      name: "__MSG_appName__",
      description: "__MSG_appDesc__",
      default_locale: "en",
      permissions: ["storage", "clipboardWrite", "tabs"],
      host_permissions: ["<all_urls>"],
      content_scripts: [{ matches: ["https://example.org/*"], js: ["content.js"] }],
      side_panel: { default_path: "panel.html" },
      icons: { 16: "icon16.png", 128: "icon128.png" },
      ...manifestOverrides,
    }),
    "_locales/en/messages.json": { appName: { message: "Clipper" }, appDesc: { message: "Clip pages into notes." } },
    "_locales/zh_CN/messages.json": { appName: { message: "剪藏" }, appDesc: { message: "把网页剪成笔记。" } },
    "background.js": [
      "chrome.storage.local.set({ seen: true });",
      "fetch('https://api.clipper.example.net/v1/save', { method: 'POST' });",
      "const run = eval(code);",
      "gtag('event', 'clip');",
      "openCheckout();",
    ].join("\n"),
    "content.js": "navigator.clipboard.writeText(document.title);",
    "panel.html": "<!doctype html><script src=\"panel.js\"></script>",
    "panel.js": "",
    "icon16.png": "x",
    "icon128.png": "x",
    ...extra,
  });
}

function facts(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  return listingFacts(dir, manifest, collectFiles(dir, manifest).files);
}

test("listing facts: permission call sites, unused ones, hosts, servers, remote code, signals", () => {
  const result = facts(fixture());
  assert.equal(result.name, "Clipper");
  const byName = Object.fromEntries(result.permissions.map((p) => [p.name, p]));
  assert.equal(byName.storage.usage[0].file, "background.js");
  assert.equal(byName.clipboardWrite.usage[0].file, "content.js"); // a web API, not chrome.*
  assert.equal(byName.tabs.unused, true);
  assert.deepEqual(result.hosts.map((h) => [h.pattern, h.source, h.broad]), [
    ["<all_urls>", "host_permissions", true],
    ["https://example.org/*", "content_scripts", false],
  ]);
  assert.deepEqual(result.endpoints.map((e) => e.origin), ["https://api.clipper.example.net"]);
  assert.equal(result.remoteCode[0].kind, "eval");
  assert.equal(result.analytics.length, 1);
  assert.equal(result.payments.length, 1);
  assert.deepEqual(result.icons.missing, [32, 48]);
  assert.deepEqual(result.locales.map((l) => l.locale), ["en", "zh_CN"]);
});

test("listing languages: package locales, extra ones not yet in the package, RTL, reading copy", () => {
  const result = facts(fixture());
  const languages = listingLanguages(result, { extra: ["ja", "ko", "ar", "zh-cn"], readerLocale: "zh_CN" });
  assert.deepEqual(languages.map((l) => l.locale), ["en", "zh_CN", "ja", "ko", "ar"]);
  assert.deepEqual(missingFromPackage(languages).map((l) => l.locale), ["ja", "ko", "ar"]);
  assert.equal(languages.find((l) => l.locale === "ar").rtl, true);
  assert.equal(normalizeLocale("zh-tw"), "zh_TW");
  assert.equal(normalizeLocale("es-419"), "es_419");
  assert.ok(isRtl("he"));
  assert.equal(guessLanguage("OCR 图片文字识别"), "zh_CN");
  assert.equal(guessLanguage("カバー"), "ja");
  assert.equal(guessLanguage("Clipper"), "en");
});

test("listing languages: a package without _locales lists in the language of its name", () => {
  const dir = writeTree(tempDir(), { "manifest.json": baseManifest({ name: "网页剪藏", description: "剪网页" }), "background.js": "" });
  const languages = listingLanguages(facts(dir), { extra: ["ja"] });
  assert.deepEqual(languages.map((l) => [l.locale, l.inPackage]), [["zh_CN", true], ["ja", false]]);
});

test("listing: scaffold in dashboard order per language, then --check until it is complete", async () => {
  const ext = fixture();
  const base = tempDir();
  const first = await runCli(["listing", ext, "--output-dir", base, "--locales", "ja,ar"]);
  assert.equal(first.code, 0, first.stdout + first.stderr);
  const dir = path.join(base, `${path.basename(ext)}-store-assets`);
  assert.match(first.stdout, /ja: add _locales\/ja\/messages\.json/);
  assert.match(first.stdout, /no use found/); // tabs
  for (const file of ["README.md", "fill-text.md", "language-versions/en/fill-text.md", "language-versions/zh_CN/fill-text.md", "language-versions/ja/fill-text.md", "language-versions/ar/fill-text.md", "working/listing-facts.md"]) {
    assert.ok(fs.existsSync(path.join(dir, file)), file);
  }
  const skeleton = fs.readFileSync(path.join(dir, "fill-text.md"), "utf8");
  const order = ["### Item name", "### Summary", "### Single purpose", "### Permission: storage", "### Host permissions", "### Remote code", "### Data use", "### Privacy policy URL", "### In-app purchases", "### Test instructions"];
  assert.deepEqual(order.map((h) => skeleton.indexOf(h)), [...order.map((h) => skeleton.indexOf(h))].sort((a, b) => a - b));
  assert.match(skeleton, /Possible remote code found/);
  assert.match(fs.readFileSync(path.join(dir, "language-versions/ar/fill-text.md"), "utf8"), /dir="rtl"/);
  assert.ok(fs.readdirSync(path.join(dir, "upload-files")).some((file) => file.endsWith(".zip")));

  const notReady = await runCli(["listing", ext, "--output-dir", base, "--locales", "ja,ar", "--check"]);
  assert.equal(notReady.code, 1);
  assert.match(notReady.stdout, /unfinished TODO/);
  assert.match(notReady.stdout, /missing language-versions\/ja\/privacy-policy\.md/);

  // finish everything
  const fillFiles = ["fill-text.md", ...["en", "zh_CN", "ja", "ar"].map((l) => `language-versions/${l}/fill-text.md`)];
  for (const relative of fillFiles) {
    const file = path.join(dir, relative);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/TODO: [^\n]*/g, "Plain answer written from the code."));
  }
  for (const locale of ["en", "zh_CN", "ja", "ar"]) {
    for (const name of ["full-submission.md", "privacy-policy.md"]) fs.writeFileSync(path.join(dir, "language-versions", locale, name), "Done.\n");
  }
  const upload = path.join(dir, "upload-files");
  fs.writeFileSync(path.join(upload, "store-icon-128.png"), encodeRgb(128, 128, Buffer.alloc(128 * 128 * 3)));
  fs.writeFileSync(path.join(upload, "promo-small-440x280.png"), encodeRgb(440, 280, Buffer.alloc(440 * 280 * 3)));
  fs.mkdirSync(path.join(upload, "screenshots"));
  fs.writeFileSync(path.join(upload, "screenshots", "01-main.png"), encodeRgb(1280, 800, Buffer.alloc(1280 * 800 * 3)));
  fs.mkdirSync(path.join(upload, "privacy-page"));
  fs.writeFileSync(path.join(upload, "privacy-page", "index.html"), "<p>Privacy</p>");
  const ready = await runCli(["listing", ext, "--output-dir", base, "--locales", "ja,ar", "--check"]);
  assert.equal(ready.code, 0, ready.stdout);
  assert.match(ready.stdout, /READY to paste/);
  assert.match(ready.stdout, /ar: add _locales\/ar/); // still a warning, not a failure

  // Markdown in a paste block and an over-long summary are caught
  const main = path.join(dir, "fill-text.md");
  const text = fs.readFileSync(main, "utf8");
  fs.writeFileSync(main, text
    .replace(/(### Detailed description\n\n```text\n)[^\n]*/, "$1- **Clips** pages")
    .replace(/(### Summary\n\n(?:[^\n]*\n\n)?```text\n)[^\n]*/, `$1${"x".repeat(140)}`));
  const again = await runCli(["listing", ext, "--output-dir", base, "--locales", "ja,ar", "--check"]);
  assert.equal(again.code, 1);
  assert.match(again.stdout, /Markdown inside a paste block/);
  assert.match(again.stdout, /summary is 140 characters/);

  // rerunning listing keeps finished writing
  const rerun = await runCli(["listing", ext, "--output-dir", base, "--locales", "ja,ar"]);
  assert.match(rerun.stdout, /not overwritten/);
  assert.match(fs.readFileSync(path.join(dir, "language-versions/en/fill-text.md"), "utf8"), /Plain answer written from the code/);
});
