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

// ---------- privacy page ----------

import http from "node:http";
import { execFileSync } from "node:child_process";
import { privacyRepoName, setPrivacyUrl } from "../scripts/lib/privacy-page.mjs";

test("privacy page: repository name from the English listing name; URL into the paste block", () => {
  assert.equal(privacyRepoName("XXD Cover Collage - WeChat covers from a few pictures"), "xxd-cover-collage-privacy");
  assert.equal(privacyRepoName("小小东 · 封面拼图"), "");
  const text = "### Privacy policy URL\n\nnote\n\n```text\nTODO: a public URL\n```\n\n### Next\n\n```text\nkeep\n```";
  const next = setPrivacyUrl(text, "https://me.github.io/x-privacy/");
  assert.match(next, /```text\nhttps:\/\/me\.github\.io\/x-privacy\/\n```/);
  assert.match(next, /```text\nkeep\n```/);
});

test("privacy-page: creates the repo, pushes, enables Pages, waits until live, fills every language", async () => {
  // a fake gh over a local bare repository, and a local "GitHub Pages" serving its main branch
  const sandbox = tempDir("xcp-gh-");
  const bare = path.join(sandbox, "remote.git");
  const server = http.createServer((request, response) => {
    try {
      response.end(execFileSync("git", ["-C", bare, "show", "main:index.html"]));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const pagesUrl = `http://127.0.0.1:${server.address().port}/`;
  const bin = path.join(sandbox, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"), `#!/usr/bin/env node
const fs = require("fs"), { execFileSync } = require("child_process");
const a = process.argv.slice(2), state = ${JSON.stringify(sandbox)} + "/state.json";
const s = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, "utf8")) : {};
const save = () => fs.writeFileSync(state, JSON.stringify(s));
const log = (x) => fs.appendFileSync(${JSON.stringify(sandbox)} + "/calls.log", x + "\\n");
log(a.join(" "));
if (a[0] === "auth") process.exit(0);
if (a[0] === "api" && a[1] === "user") { console.log("tester"); process.exit(0); }
if (a[0] === "repo" && a[1] === "view") process.exit(s.created ? 0 : 1);
if (a[0] === "repo" && a[1] === "create") { execFileSync("git", ["init", "--bare", "-q", "-b", "main", ${JSON.stringify(bare)}]); s.created = true; save(); process.exit(0); }
if (a[0] === "repo" && a[1] === "clone") { execFileSync("git", ["clone", "-q", ${JSON.stringify(bare)}, a[3]], { stdio: "ignore" }); process.exit(0); }
if (a[0] === "api" && a.includes("POST")) { s.pages = true; save(); process.exit(0); }
if (a[0] === "api" && a[1].endsWith("/pages")) { if (!s.pages) process.exit(1); if (a.includes("-q")) console.log(${JSON.stringify(pagesUrl)}); process.exit(0); }
process.exit(2);
`, { mode: 0o755 });

  try {
    const ext = fixture();
    const base = tempDir();
    await runCli(["listing", ext, "--output-dir", base, "--locales", "ja"]);
    const dir = path.join(base, `${path.basename(ext)}-store-assets`);
    fs.mkdirSync(path.join(dir, "upload-files", "privacy-page"), { recursive: true });
    fs.writeFileSync(path.join(dir, "upload-files", "privacy-page", "index.html"), "<h1>Clipper privacy policy</h1><p>Nothing leaves your browser.</p>");
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com",
    };
    const result = await runCli(["privacy-page", ext, "--output-dir", base], { env });
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /created https:\/\/github\.com\/tester\/clipper-privacy \(public\)/);
    assert.match(result.stdout, /live\s+yes/);
    for (const relative of ["fill-text.md", "language-versions/en/fill-text.md", "language-versions/ja/fill-text.md"]) {
      assert.match(fs.readFileSync(path.join(dir, relative), "utf8"), new RegExp(`Privacy policy URL[\\s\\S]*?\`\`\`text\\n${pagesUrl.replace(/[.]/g, "\\.")}\\n`), relative);
    }
    // running it again changes nothing on the remote
    const again = await runCli(["privacy-page", ext, "--output-dir", base], { env });
    assert.match(again.stdout, /\(exists\)/);
    assert.match(again.stdout, /index\.html unchanged/);
  } finally {
    server.close();
  }
});

test("pack --patch bumps manifest.json (and a package.json on the same version) before packing; plain pack doesn't", async () => {
  const ext = writeTree(tempDir(), {
    "manifest.json": baseManifest({ version: "1.2.3" }),
    "package.json": { name: "x", version: "1.2.3" },
    "background.js": "",
  });
  const out = tempDir();
  const bumped = await runCli(["pack", ext, "--output-dir", out, "--patch"]);
  assert.equal(bumped.code, 0, bumped.stdout + bumped.stderr);
  assert.match(bumped.stdout, /1\.2\.3 → 1\.2\.4/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8")).version, "1.2.4");
  assert.equal(JSON.parse(fs.readFileSync(path.join(ext, "package.json"), "utf8")).version, "1.2.4");
  assert.ok(fs.readdirSync(out).some((file) => file.endsWith("v1.2.4.zip")));
  await runCli(["pack", ext, "--output-dir", out]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8")).version, "1.2.4");
});
