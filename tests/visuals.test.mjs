import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { crc32 } from "../scripts/lib/zip.mjs";
import { decodePng, encodeRgb, flattenPng, pngInfo } from "../scripts/lib/visuals/png.mjs";
import { chromeStubScript } from "../scripts/lib/visuals/chrome-stubs.mjs";
import { entryPages, extensionText, loadMessages, storeAssetsDir } from "../scripts/lib/visuals/pages.mjs";
import { checkUploadFiles, contrast, parseVisualArgs, toHex, tokensFromProbe } from "../scripts/lib/visuals/commands.mjs";
import { findChrome, runtimeInstalled } from "../scripts/lib/visuals/runtime.mjs";
import { CLI, tempDir, writeTree, baseManifest } from "./helpers.mjs";

const run = promisify(execFile);

/** An 8-bit RGBA PNG (colour type 6), like a browser capture. */
function rgbaPng(width, height, pixel) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) Buffer.from(pixel(x, y)).copy(raw, y * (width * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- png ----------

test("png: RGB encode → decode round trip keeps every pixel", () => {
  const width = 7;
  const height = 5;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < rgb.length; i += 1) rgb[i] = (i * 37) % 256;
  const decoded = decodePng(encodeRgb(width, height, rgb));
  assert.equal(decoded.bpp, 3);
  assert.deepEqual(decoded.pixels, rgb);
});

test("png: flatten turns an RGBA capture into 24-bit RGB on the background", () => {
  const dir = tempDir();
  const file = path.join(dir, "a.png");
  // left column opaque red, right column fully transparent
  fs.writeFileSync(file, rgbaPng(2, 2, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0])));
  assert.equal(pngInfo(file).hasAlpha, true);
  flattenPng(file, { background: "#00ff00" });
  const info = pngInfo(file);
  assert.equal(info.hasAlpha, false);
  assert.equal(info.colorType, 2);
  const { pixels } = decodePng(fs.readFileSync(file));
  assert.deepEqual([...pixels.subarray(0, 6)], [255, 0, 0, 0, 255, 0]);
});

// ---------- chrome.* stand-ins ----------

function stubWindow(options) {
  const window = { location: { origin: "http://127.0.0.1:1" } };
  window.window = window;
  const context = vm.createContext({ window, location: window.location, setTimeout, Promise, JSON, console, Object, Set, RegExp, String, Proxy });
  vm.runInContext(chromeStubScript(options), context);
  return window.chrome;
}

test("stubs: i18n reads the locale's messages with placeholders, storage is seeded and live", async () => {
  const chrome = stubWindow({
    manifest: { name: "x", default_locale: "en", permissions: ["storage"] },
    locale: "ja",
    messages: {
      greet: { message: "こんにちは $NAME$", placeholders: { name: { content: "$1" } } },
      appname: { message: "アプリ" },
    },
    storage: { local: { session: { token: "demo" } } },
  });
  // objects come from another vm realm: compare as JSON
  const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  assert.equal(chrome.i18n.getMessage("greet", ["東"]), "こんにちは 東");
  assert.equal(chrome.i18n.getMessage("AppName"), "アプリ");
  assert.equal(chrome.i18n.getUILanguage(), "ja");
  same(await chrome.storage.local.get("session"), { session: { token: "demo" } });
  await chrome.storage.local.set({ other: 1 });
  same(await chrome.storage.local.get(["other", "missing"]), { other: 1 });
  const viaCallback = await new Promise((resolve) => chrome.storage.local.get({ missing: 5 }, resolve));
  same(viaCallback, { missing: 5 });
});

test("stubs: unknown APIs resolve instead of throwing; events accept listeners", async () => {
  const chrome = stubWindow({ manifest: { name: "x" }, locale: "en", messages: {} });
  assert.equal(await chrome.offscreen.createDocument({}), undefined);
  chrome.contextMenus.onClicked.addListener(() => {});
  assert.equal(chrome.contextMenus.onClicked.hasListeners(), true);
  const [tab] = await chrome.tabs.query({ active: true });
  assert.match(tab.url, /^https:\/\//);
});

// ---------- pages ----------

test("pages: messages fall back locale → language → default; entry pages in order", () => {
  const dir = writeTree(tempDir(), {
    "manifest.json": baseManifest({ name: "__MSG_appName__", default_locale: "en", side_panel: { default_path: "panel.html" }, action: { default_popup: "popup.html" } }),
    "_locales/en/messages.json": { appName: { message: "Cover" }, only: { message: "en only" } },
    "_locales/zh_CN/messages.json": { appName: { message: "封面" } },
  });
  assert.equal(extensionText(dir, "zh_CN").name, "封面");
  assert.equal(extensionText(dir, "fr").name, "Cover");
  assert.equal(loadMessages(dir, "zh_CN").only.message, "en only");
  assert.deepEqual(entryPages(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"))).map((p) => p.kind), ["sidepanel", "popup"]);
});

test("pages: store assets go to the Desktop unless the folder already sits next to the extension", () => {
  const base = tempDir();
  const ext = path.join(base, "my-ext");
  const desktop = path.join(base, "Desktop");
  fs.mkdirSync(ext);
  assert.equal(storeAssetsDir(ext, desktop), path.join(desktop, "my-ext-store-assets"));
  fs.mkdirSync(path.join(base, "my-ext-store-assets"));
  assert.equal(storeAssetsDir(ext, desktop), path.join(base, "my-ext-store-assets"));
});

// ---------- style tokens ----------

test("style: named variables win, rendered colours fill the gaps", () => {
  const xxd = tokensFromProbe({
    attrs: { corners: "square" },
    vars: { "--paper": "#ffffff", "--ink": "#111111", "--muted": "#6b6b6b", "--line": "#e7e7ea", "--action": "#111111" },
    body: { "background-color": "rgb(255, 255, 255)", color: "rgb(17, 17, 17)", "font-family": "Avenir Next" },
    weights: { 400: 10, 600: 2, 500: 3 }, radii: {}, bgArea: {}, textColors: {},
  });
  assert.equal(xxd.paper, "#ffffff");
  assert.equal(xxd.accent, "#111111");
  assert.equal(xxd.corners, "square");
  assert.deepEqual(xxd.weights, [400, 500, 600]);

  const custom = tokensFromProbe({
    attrs: {},
    vars: {},
    body: { "background-color": "rgba(0, 0, 0, 0)", color: "rgb(74, 74, 74)", "font-family": "system-ui" },
    primary: { "background-color": "rgb(139, 154, 130)", color: "rgb(255, 255, 255)" },
    input: { "border-top-color": "rgb(229, 226, 222)", "border-top-left-radius": "8px" },
    weights: { 400: 4 }, radii: { "8px": 6 }, bgArea: { "rgb(245, 243, 240)": 90000 }, textColors: { "rgb(74, 74, 74)": 9, "rgb(140, 140, 140)": 3 },
  });
  assert.equal(custom.paper, "#f5f3f0");
  assert.equal(custom.accent, "#8b9a82");
  assert.equal(custom.muted, "#8c8c8c");
  assert.equal(custom.corners, "rounded");
  assert.equal(custom.radius, "8px");
});

test("style: colour helpers", () => {
  assert.equal(toHex("rgba(0, 0, 0, 0)"), null);
  assert.equal(toHex("rgb(23 22 18)"), "#171612");
  assert.ok(contrast("#171612", "#f3f0ea") > 15);
});

test("visual args: --compare takes every following path", () => {
  const options = parseVisualArgs(["ext", "--svg", "a.svg", "--compare", "x.png", "y.png", "--install"]);
  assert.deepEqual(options.compare, ["x.png", "y.png"]);
  assert.equal(options.install, true);
  assert.deepEqual(options._, ["ext"]);
});

// ---------- upload-files check ----------

test("images: wrong sizes and alpha are flagged; a language borrowing default tiles is noted", () => {
  const dir = tempDir();
  const write = (relative, buffer) => {
    fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    fs.writeFileSync(path.join(dir, relative), buffer);
  };
  write("store-icon-128.png", encodeRgb(128, 128, Buffer.alloc(128 * 128 * 3)));
  write("promo-small-440x280.png", rgbaPng(440, 280, () => [0, 0, 0, 255]));
  write("screenshots/01-main.png", encodeRgb(1280, 700, Buffer.alloc(1280 * 700 * 3)));
  write("locales/ja/promo-marquee-1400x560.png", encodeRgb(1400, 560, Buffer.alloc(1400 * 560 * 3)));
  const { rows, notes } = checkUploadFiles(dir);
  const status = Object.fromEntries(rows.map((row) => [row.file, row.status]));
  assert.equal(status["store-icon-128.png"], "ok");
  assert.equal(status["promo-small-440x280.png"], "has alpha");
  assert.equal(status["screenshots/01-main.png"], "wrong size");
  assert.equal(status["locales/ja/promo-marquee-1400x560.png"], "ok");
  assert.ok(notes.some((note) => note.startsWith("ja: uses the default-language small")));
  assert.ok(notes.some((note) => note === "default language: 1 screenshot — the store shows up to 5"));
});

// ---------- with a real browser ----------

const browserReady = Boolean(findChrome()) && (runtimeInstalled() || process.env.XCP_BROWSER_TESTS === "1");
const browserNote = browserReady ? false : "needs Google Chrome and the browser runtime (run any store-image command once, or XCP_BROWSER_TESTS=1)";

test("shots: a side panel is framed to 1280×800, in the asked language, offline", { skip: browserNote, timeout: 120000 }, async () => {
  const ext = writeTree(tempDir(), {
    "manifest.json": baseManifest({ name: "__MSG_appName__", default_locale: "en", side_panel: { default_path: "panel.html" } }),
    "_locales/en/messages.json": { appName: { message: "Demo" }, hello: { message: "Hello" } },
    "_locales/ja/messages.json": { appName: { message: "デモ" }, hello: { message: "こんにちは" } },
    "panel.html": `<!doctype html><html><body><h1 id="t"></h1><p id="net">pending</p><script>
      document.getElementById("t").textContent = chrome.i18n.getMessage("hello");
      chrome.storage.local.get("user").then((r) => { document.body.dataset.user = r.user; });
      fetch("https://example.com/").then(() => { net.textContent = "online"; }, () => { net.textContent = "offline"; });
    </script></body></html>`,
  });
  const scenario = path.join(ext, "shots.json");
  fs.writeFileSync(scenario, JSON.stringify({
    urlPath: "/panel.html",
    layout: { mode: "sidepanel", hostUrl: "example.com" },
    storage: { local: { user: "demo" } },
    ready: { function: "document.body.dataset.user === 'demo' && net.textContent !== 'pending'", delayMs: 50 },
    shots: [{ name: "01-hello", actions: [{ type: "waitForFunction", script: "t.textContent === 'こんにちは' && net.textContent === 'offline'" }], elements: [{ selector: "#t", name: "title" }] }],
  }));
  const out = path.join(ext, "out");
  const raw = path.join(ext, "raw");
  await run(process.execPath, [CLI, "shots", ext, "--scenario", scenario, "--locale", "ja", "--output-dir", out, "--raw-dir", raw]);
  const shot = pngInfo(path.join(out, "01-hello.png"));
  assert.deepEqual([shot.width, shot.height, shot.hasAlpha], [1280, 800, false]);
  assert.equal(pngInfo(path.join(raw, "01-hello.png")).width, 800); // 400 px panel at 2×
  assert.ok(fs.existsSync(path.join(raw, "title.png")));
  assert.ok(fs.existsSync(path.join(out, "00-contact-sheet.png")));
});

test("tile: renders the exact size without alpha and reports layout problems", { skip: browserNote, timeout: 60000 }, async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "ok.html"), `<html><body style="margin:0;font:16px sans-serif"><p data-one-line style="margin:20px">Fine</p></body></html>`);
  fs.writeFileSync(path.join(dir, "bad.html"), `<html><body style="margin:0;font:12px sans-serif"><p data-one-line style="width:60px">wraps onto several lines here</p><p style="position:absolute;left:420px;font-size:20px">out of the frame</p></body></html>`);
  await run(process.execPath, [CLI, "tile", path.join(dir, "ok.html"), "--size", "440x280", "--out", path.join(dir, "ok.png")]);
  const info = pngInfo(path.join(dir, "ok.png"));
  assert.deepEqual([info.width, info.height, info.hasAlpha], [440, 280, false]);
  const failed = await run(process.execPath, [CLI, "tile", path.join(dir, "bad.html"), "--size", "440x280", "--out", path.join(dir, "bad.png")]).catch((error) => error);
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /wraps to \d lines/);
  assert.match(failed.stdout, /text out of frame/);
  assert.match(failed.stdout, /font 12px < 14px/);
});
