// Store images: screenshots, the icon set and promo tiles, all derived from the
// extension itself — its real pages, the colours/fonts/corners its UI actually
// renders, and what its code does. Every image the store receives is 24-bit
// PNG with no alpha, at the exact size the store asks for.
//
//   shots        capture listing screenshots from a scenario file
//   style        read the UI's computed style → style.json + tokens.css
//   icon         one SVG → 16/32/48/128 icons, store icon, review sheet
//   tile         render a promo tile HTML → PNG, with layout checks
//   images       check upload-files/ and build a store-page preview board
//   demo-images  clean sample pictures (several subjects and shapes) for scenarios

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { frameHtml, FRAME } from "./browser-frame.mjs";
import { openExtensionPage } from "./open-page.mjs";
import { entryPages, extensionText, iconPath, listLocales, readManifest, storeAssetsDir } from "./pages.mjs";
import { flattenPng, pngInfo } from "./png.mjs";
import { escapeHtml, fileToDataUrl, launchBrowser } from "./runtime.mjs";
import { defaultOutputDir, loadGlobalConfig } from "../project.mjs";

export const VISUAL_COMMANDS = ["shots", "style", "icon", "tile", "images", "demo-images"];

export const VISUAL_HELP = `
Store images (need Google Chrome; playwright-core installs itself on first use)
  shots [dir] --scenario FILE   listing screenshots, 1280×800; side panels and popups are framed in a
                                browser window. --locale xx, --color-scheme dark, --only 01,
                                --assets-dir DIR, --raw-dir DIR (unframed 2× captures + "elements" crops)
  style [dir]                   read the UI's real colours, fonts, corners and the icon → style.json,
                                tokens.css (--page FILE, --locale xx)
  icon [dir] --svg FILE         16/32/48/128 icons + store-icon-128.png + icon-preview.png
                                (--png FILE to keep a bitmap icon, --svg-small FILE, --compare PNG…,
                                --install to write them into the extension, originals backed up)
  tile FILE.html --size WxH --out FILE.png   render a promo tile and check it
  images [dir]                  sizes and alpha of everything in upload-files/ + a preview board
  demo-images DIR               sample-1…10.png, landscape/portrait/square/wide, to load into
                                scenarios (--count N)
  Output goes to <Desktop>/<extension folder>-store-assets/ unless --output-dir / --out is given.
`;

const FLAGS = new Set(["install", "noContactSheet", "help"]);

export function parseVisualArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h") { options.help = true; continue; }
    if (!arg.startsWith("--")) { options._.push(arg); continue; }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (FLAGS.has(key)) { options[key] = true; continue; }
    if (key === "compare") {
      // --compare a.png b.png … takes every following non-flag value
      options.compare = [];
      while (argv[index + 1] && !argv[index + 1].startsWith("--")) options.compare.push(argv[(index += 1)]);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function assetsDir(extDir) {
  return storeAssetsDir(extDir, defaultOutputDir(loadGlobalConfig()));
}

const say = (text = "") => process.stdout.write(`${text}\n`);

// ---------- shots ----------

async function runActions(page, actions = [], resolveFile) {
  for (const action of actions) {
    const timeout = action.timeoutMs || 10000;
    switch (action.type) {
      case "evaluate": await page.evaluate(action.script); break;
      case "wait": await page.waitForTimeout(action.ms || 300); break;
      case "waitForSelector": await page.waitForSelector(action.selector, { state: action.state || "visible", timeout }); break;
      case "waitForFunction": await page.waitForFunction(action.script, null, { timeout }); break;
      case "click": await page.click(action.selector, { timeout }); break;
      case "fill": await page.fill(action.selector, action.value ?? "", { timeout }); break;
      case "press":
        if (action.selector) await page.press(action.selector, action.key, { timeout });
        else await page.keyboard.press(action.key);
        break;
      case "setInputFiles": await page.setInputFiles(action.selector, [].concat(action.files).map(resolveFile), { timeout }); break;
      case "check": await page.check(action.selector, { timeout }); break;
      case "uncheck": await page.uncheck(action.selector, { timeout }); break;
      case "select": await page.selectOption(action.selector, action.value, { timeout }); break;
      case "hover": await page.hover(action.selector, { timeout }); break;
      case "scroll":
        await page.evaluate(([selector, y]) => {
          const element = selector ? document.querySelector(selector) : document.scrollingElement;
          if (element) element.scrollTop = y;
        }, [action.selector || null, action.y || 0]);
        break;
      default: throw new Error(`unknown action type: ${action.type}`);
    }
  }
}

async function waitReady(page, ready = {}) {
  const timeout = ready.timeoutMs || 15000;
  for (const selector of ready.selectors || []) await page.waitForSelector(selector, { timeout });
  if (ready.function) await page.waitForFunction(ready.function, null, { timeout });
  await page.waitForTimeout(ready.delayMs ?? 300);
}

async function shots(options) {
  if (!options.scenario) throw new Error("shots needs --scenario FILE (see references/screenshots.md)");
  const extDir = path.resolve(options._[0] || ".");
  const scenarioFile = path.resolve(options.scenario);
  const scenarioDir = path.dirname(scenarioFile);
  const scenario = JSON.parse(fs.readFileSync(scenarioFile, "utf8"));
  const root = scenario.root ? path.resolve(extDir, scenario.root) : extDir;
  const manifest = readManifest(root);
  const locale = options.locale || scenario.locale;
  const colorScheme = options.colorScheme || scenario.colorScheme || "light";
  const layout = { mode: "page", panelWidth: 400, popupWidth: 380, popupMaxHeight: 600, ...(scenario.layout || {}) };
  const W = scenario.viewport?.width || 1280;
  const H = scenario.viewport?.height || 800;
  const otherLocale = locale && locale !== manifest.default_locale;
  const outDir = path.resolve(options.outputDir
    || path.join(assetsDir(extDir), "upload-files", ...(otherLocale ? ["locales", locale] : []), "screenshots"));
  const rawDir = options.rawDir ? path.resolve(options.rawDir) : null;
  const scale = layout.mode === "page" ? 1 : Number(options.scale || (rawDir ? 2 : 1));
  const assets = options.assetsDir ? path.resolve(options.assetsDir) : null;
  fs.mkdirSync(outDir, { recursive: true });
  if (rawDir) fs.mkdirSync(rawDir, { recursive: true });

  const resolveFile = (file) => {
    if (path.isAbsolute(file)) return file;
    if (file.startsWith("./") || file.startsWith("../")) return path.resolve(scenarioDir, file);
    if (assets && fs.existsSync(path.join(assets, file))) return path.join(assets, file);
    return path.resolve(scenarioDir, file);
  };

  const text = extensionText(root, locale);
  const icon = iconPath(root, manifest, 32);
  const top = FRAME.tabStrip + FRAME.toolbar;
  const viewport = layout.mode === "sidepanel" ? { width: layout.panelWidth, height: H - top - FRAME.panelHeader }
    : layout.mode === "popup" ? { width: layout.popupWidth, height: layout.popupMaxHeight }
    : { width: W, height: H };

  const browser = await launchBrowser();
  const results = [];
  let session;
  try {
    const host = { url: layout.hostUrl || "", title: layout.hostTitle || "" };
    if (layout.hostImage) host.image = fileToDataUrl(resolveFile(layout.hostImage));
    else if (layout.hostUrl && layout.captureHost) {
      const hostWidth = layout.mode === "sidepanel" ? W - layout.panelWidth - 1 : W;
      const context = await browser.newContext({ viewport: { width: hostWidth, height: H - top }, colorScheme });
      const page = await context.newPage();
      const url = /^[a-z]+:/.test(layout.hostUrl) ? layout.hostUrl : `https://${layout.hostUrl}`;
      await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      host.image = `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;
      if (!host.title) host.title = await page.title().catch(() => "");
      await context.close();
    }
    const ext = { name: text.name, icon: icon && fs.existsSync(icon) ? fileToDataUrl(icon) : null };

    session = await openExtensionPage(browser, {
      root, pagePath: scenario.urlPath, locale, viewport, colorScheme, storage: scenario.storage,
      localStorage: scenario.localStorage, hostUrl: layout.hostUrl, hostTitle: host.title, runtimeReply: scenario.runtimeReply,
      useChromeStubs: scenario.useChromeStubs !== false, deviceScaleFactor: scale, allowNetwork: scenario.allowNetwork === true,
    });
    const { page } = session;
    await waitReady(page, scenario.ready);
    await runActions(page, scenario.afterLoadActions, resolveFile);

    const framePage = layout.mode === "page" ? null : await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    for (const shot of scenario.shots || []) {
      if (options.only && !shot.name.startsWith(options.only)) continue;
      await runActions(page, scenario.beforeEachShotActions, resolveFile);
      await runActions(page, shot.actions, resolveFile);
      const file = path.join(outDir, shot.name.endsWith(".png") ? shot.name : `${shot.name}.png`);
      if (layout.mode === "page") {
        await page.screenshot({ path: file });
        if (rawDir) fs.copyFileSync(file, path.join(rawDir, path.basename(file)));
      } else {
        let height = viewport.height;
        if (layout.mode === "popup") {
          height = Math.min(layout.popupMaxHeight, await page.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))));
        }
        const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height } });
        if (rawDir) {
          const raw = path.join(rawDir, path.basename(file));
          fs.writeFileSync(raw, buffer);
          flattenPng(raw);
        }
        const image = `data:image/png;base64,${buffer.toString("base64")}`;
        await framePage.setContent(frameHtml({
          width: W, height: H, mode: layout.mode, dark: colorScheme === "dark", ext, host,
          panel: { width: viewport.width, image }, popup: { width: viewport.width, height, image },
        }), { waitUntil: "load" });
        await framePage.screenshot({ path: file });
      }
      flattenPng(file);
      // single elements (e.g. the cover the extension made) cropped out for promo tiles
      for (const element of shot.elements || []) {
        if (!rawDir) {
          say(`  skip element "${element.name}": needs --raw-dir`);
          continue;
        }
        const crop = path.join(rawDir, element.name.endsWith(".png") ? element.name : `${element.name}.png`);
        const hide = [].concat(element.hide || []);
        const setHidden = (hidden) => page.evaluate(([selectors, on]) => selectors.forEach((selector) => document.querySelectorAll(selector).forEach((node) => {
          if (on) { node.dataset.xcpVisibility = node.style.visibility; node.style.visibility = "hidden"; }
          else { node.style.visibility = node.dataset.xcpVisibility || ""; delete node.dataset.xcpVisibility; }
        })), [hide, hidden]);
        if (hide.length) await setHidden(true);
        await page.locator(element.selector).first().screenshot({ path: crop });
        if (hide.length) await setHidden(false);
        flattenPng(crop);
        say(`  element    ${element.selector} → ${path.basename(crop)}`);
      }
      const info = pngInfo(file);
      results.push({ file, width: info.width, height: info.height });
      say(`  shot       ${path.basename(file)}  ${info.width}×${info.height}`);
    }
    if (session.errors.length) {
      say(`  warning    page errors — check the shots look right: ${[...new Set(session.errors)].slice(0, 6).join(" | ")}`);
    }
  } finally {
    if (session) await session.close();
    await browser.close();
  }
  if (!options.noContactSheet && results.length) {
    await contactSheet(outDir, path.join(outDir, "00-contact-sheet.png"));
    say("  sheet      00-contact-sheet.png");
  }
  say(`  => ${results.length} screenshots in ${outDir}${rawDir ? `\n     unframed ${scale}× captures in ${rawDir}` : ""}`);
  const wrong = results.filter((r) => r.width !== W || r.height !== H);
  if (wrong.length) throw new Error(`wrong size: ${wrong.map((r) => path.basename(r.file)).join(", ")}`);
  return 0;
}

// sample-2 before sample-10
const naturally = (a, b) => a.localeCompare(b, "en", { numeric: true });

export async function contactSheet(dir, out) {
  const files = fs.readdirSync(dir).filter((file) => /\.(png|jpe?g)$/i.test(file) && !file.startsWith("00-")).sort(naturally);
  if (!files.length) throw new Error(`no images in ${dir}`);
  const columns = files.length <= 4 ? 2 : 3;
  const cell = 400;
  const gap = 24;
  const pad = 32;
  const width = pad * 2 + columns * cell + (columns - 1) * gap;
  const cells = files.map((file) => `<figure><img src="${fileToDataUrl(path.join(dir, file))}"><figcaption>${escapeHtml(file)}</figcaption></figure>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#f4f3f0;width:${width}px;font:12px -apple-system,"PingFang SC",sans-serif;color:#3b3a36}
    main{display:grid;grid-template-columns:repeat(${columns},${cell}px);gap:${gap}px;padding:${pad}px}
    figure{margin:0}img{width:100%;display:block;border:1px solid #dddad3;background:#fff}
    figcaption{margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style></head><body><main>${cells}</main></body></html>`;
  await renderHtml(html, out, { width, height: 400, fullPage: true, background: "#f4f3f0" });
  return out;
}

async function renderHtml(html, out, { width, height, fullPage = false, background = "#ffffff" }) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html, { waitUntil: "load" });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, fullPage });
  } finally {
    await browser.close();
  }
  flattenPng(out, { background });
}

// ---------- demo images ----------

// Clean flat scenes in percentages, so each works at any aspect ratio. No real
// photos, no people, nothing anyone owns. Sizes cycle through landscape,
// portrait, square and wide, because extensions handle all of them.
const box = (css) => `<div style="position:absolute;${css}"></div>`;
const DEMO_SCENES = [
  // shore
  [box("inset:0;background:linear-gradient(#bcd8e6,#e8eff0 60%)"), box("left:70%;top:18%;width:11%;aspect-ratio:1;border-radius:50%;background:#f4c77a"),
    box("left:0;right:0;top:56%;bottom:0;background:#4f8aa6"), box("left:-12%;right:-12%;top:78%;bottom:-30%;border-radius:50% 50% 0 0;background:#e9d8b8")],
  // hills
  [box("inset:0;background:#f1e6d6"), box("left:-20%;top:38%;width:80%;aspect-ratio:1;transform:rotate(45deg);background:#9fb59a"),
    box("left:44%;top:46%;width:75%;aspect-ratio:1;transform:rotate(45deg);background:#6f8f78"), box("left:0;right:0;top:82%;bottom:0;background:#3f5e4f")],
  // still life
  [box("inset:0;background:#e7e2f0"), box("left:0;right:0;top:64%;bottom:0;background:#c9bfd8"),
    box("left:22%;top:30%;width:19%;height:42%;background:#e86f51"), box("left:47%;top:42%;width:19%;aspect-ratio:1;border-radius:50%;background:#2f6f8f"),
    box("left:70%;top:47%;width:18%;height:25%;clip-path:polygon(50% 0,100% 100%,0 100%);background:#f2b84b")],
  // city at dusk
  [box("inset:0;background:linear-gradient(#f6c9a8,#f3e3d3 70%)"), box("left:8%;top:44%;width:12%;bottom:0;background:#5b6b8c"),
    box("left:22%;top:30%;width:14%;bottom:0;background:#44547a"), box("left:38%;top:52%;width:10%;bottom:0;background:#6d7ea0"),
    box("left:50%;top:22%;width:13%;bottom:0;background:#3a4868"), box("left:66%;top:40%;width:15%;bottom:0;background:#56668a"),
    box("left:83%;top:58%;width:12%;bottom:0;background:#7486a8")],
  // dunes
  [box("inset:0;background:#f7ecd9"), box("left:-30%;top:48%;width:110%;height:90%;border-radius:50%;background:#e9bf86"),
    box("left:30%;top:60%;width:110%;height:90%;border-radius:50%;background:#d79f5f"), box("left:62%;top:14%;width:9%;aspect-ratio:1;border-radius:50%;background:#fbf4e6")],
  // night lake
  [box("inset:0;background:#1f2a44"), box("left:18%;top:16%;width:10%;aspect-ratio:1;border-radius:50%;background:#f1ead2"),
    box("left:0;right:0;top:62%;bottom:0;background:#2c3c5e"), box("left:0;right:0;top:58%;height:6%;background:#14203a"),
    box("left:20%;top:68%;width:6%;height:1.2%;background:#f1ead2;opacity:.55"), box("left:18.5%;top:74%;width:9%;height:1.2%;background:#f1ead2;opacity:.35")],
  // flower field
  [box("inset:0;background:#dfeef0"), box("left:0;right:0;top:48%;bottom:0;background:#8fbf7e"),
    ...[[12, 62, "#f28a8a"], [28, 70, "#f6d26b"], [44, 60, "#f7f2ea"], [60, 74, "#f28a8a"], [76, 64, "#c9a3e6"], [20, 84, "#f7f2ea"], [52, 88, "#f6d26b"], [84, 86, "#f28a8a"]]
      .map(([x, y, c]) => box(`left:${x}%;top:${y}%;width:6%;aspect-ratio:1;border-radius:50%;background:${c}`))],
  // window and plant
  [box("inset:0;background:#efe9df"), box("left:18%;top:12%;width:44%;height:58%;background:#bcd9e8"),
    box("left:39.5%;top:12%;width:1%;height:58%;background:#efe9df"), box("left:18%;top:40.5%;width:44%;height:1%;background:#efe9df"),
    box("left:66%;top:52%;width:14%;height:22%;background:#c46b4e"), box("left:63%;top:24%;width:20%;height:32%;border-radius:50% 50% 40% 40%;background:#5e8f5a"),
    box("left:0;right:0;top:74%;bottom:0;background:#d8cdbd")],
  // fruit
  [box("inset:0;background:#fbe9e1"), box("left:16%;top:30%;width:26%;aspect-ratio:1;border-radius:50%;background:#f08a3c"),
    box("left:44%;top:40%;width:22%;aspect-ratio:1;border-radius:50%;background:#e4c74f"), box("left:64%;top:26%;width:20%;aspect-ratio:1;border-radius:50%;background:#7fae5b"),
    box("left:0;right:0;top:80%;bottom:0;background:#f1cdbd")],
  // snow peak
  [box("inset:0;background:linear-gradient(#cfe0f1,#eef3f8)"), box("left:20%;top:24%;width:60%;height:76%;clip-path:polygon(50% 0,100% 100%,0 100%);background:#8aa1bd"),
    box("left:20%;top:24%;width:60%;height:76%;clip-path:polygon(50% 0,62% 22%,55% 20%,47% 26%,40% 21%);background:#ffffff"),
    box("left:0;right:0;top:86%;bottom:0;background:#f5f8fb")],
];
const DEMO_SIZES = [[1600, 1000], [1200, 1600], [1400, 1400], [2350, 1000]];

async function demoImages(options) {
  const out = path.resolve(options._[0] || ".");
  const count = Math.max(1, Math.min(40, Number(options.count || DEMO_SCENES.length)));
  fs.mkdirSync(out, { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    for (let index = 0; index < count; index += 1) {
      const scene = DEMO_SCENES[index % DEMO_SCENES.length];
      // the size moves on with every image, and shifts once per round so repeated scenes change shape
      const [width, height] = DEMO_SIZES[(index + Math.floor(index / DEMO_SCENES.length)) % DEMO_SIZES.length];
      await page.setViewportSize({ width, height });
      await page.setContent(`<body style="margin:0;position:relative;width:${width}px;height:${height}px;overflow:hidden">${scene.join("")}</body>`);
      const file = path.join(out, `sample-${index + 1}.png`);
      await page.screenshot({ path: file });
      flattenPng(file);
      say(`  image      ${path.basename(file)}  ${width}×${height}`);
    }
  } finally {
    await browser.close();
  }
  say(`  => ${count} demo pictures in ${out}`);
  return 0;
}

// ---------- style ----------

function probeInPage() {
  const css = (element) => getComputedStyle(element);
  const root = document.documentElement;
  const names = new Set();
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) {
        try { walk(rule.cssRules); } catch {}
        continue;
      }
      if (rule.style && /(^|,)\s*(:root|html)\b/.test(rule.selectorText || "")) {
        for (const prop of rule.style) if (prop.startsWith("--")) names.add(prop);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch {}
  }
  const rootStyle = css(root);
  const vars = {};
  for (const name of names) {
    const value = rootStyle.getPropertyValue(name).trim();
    if (value && value.length < 200) vars[name] = value;
  }
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = css(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const first = (selectors) => {
    for (const selector of selectors) {
      const element = [...document.querySelectorAll(selector)].find(visible);
      if (element) return element;
    }
    return null;
  };
  const props = ["background-color", "color", "border-top-color", "border-top-width", "border-top-left-radius", "font-family", "font-size", "font-weight", "box-shadow"];
  const pick = (element) => (element ? Object.fromEntries(props.map((prop) => [prop, css(element).getPropertyValue(prop)])) : null);
  const weights = {};
  const radii = {};
  const bgArea = {};
  const textColors = {};
  for (const element of document.querySelectorAll("body, body *")) {
    if (!visible(element)) continue;
    const style = css(element);
    const rect = element.getBoundingClientRect();
    if ([...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())) {
      weights[style.fontWeight] = (weights[style.fontWeight] || 0) + 1;
      textColors[style.color] = (textColors[style.color] || 0) + 1;
    }
    const radius = style.borderTopLeftRadius;
    if (radius !== "0px" && !/50%|999/.test(radius) && (style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.borderTopWidth !== "0px")) {
      radii[radius] = (radii[radius] || 0) + 1;
    }
    if (style.backgroundColor !== "rgba(0, 0, 0, 0)") bgArea[style.backgroundColor] = (bgArea[style.backgroundColor] || 0) + rect.width * rect.height;
  }
  return {
    attrs: { theme: root.getAttribute("data-theme"), corners: root.getAttribute("data-corners") },
    vars,
    body: pick(document.body),
    primary: pick(first([".xxd-btn--primary", ".ui-btn--primary", ".btn--primary", ".btn-primary", "button.primary", 'button[class*="primary"]', 'a[class*="primary"]', "button[type=submit]"])),
    button: pick(first(["button", ".btn", "[role=button]"])),
    input: pick(first(["input[type=text]", "input[type=email]", "input[type=search]", "input:not([type])", "textarea", "select"])),
    weights, radii, bgArea, textColors,
  };
}

export function toHex(color) {
  if (!color) return null;
  const match = String(color).match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?/);
  if (!match) return /^#[0-9a-f]{3,8}$/i.test(String(color).trim()) ? String(color).trim().toLowerCase() : null;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  if (alpha < 0.5) return null;
  return `#${[match[1], match[2], match[3]].map((value) => Math.round(+value).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const ranked = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]);

/** Turn a page probe into design tokens: named variables first, rendered styles as fallback. */
export function tokensFromProbe(probe) {
  const fromVars = (...names) => {
    for (const name of names) {
      const value = probe.vars[name];
      if (value) return toHex(value) || value;
    }
    return null;
  };
  const paper = fromVars("--paper", "--bg", "--background", "--surface") || toHex(ranked(probe.bgArea)[0]?.[0]) || toHex(probe.body?.["background-color"]) || "#ffffff";
  const ink = fromVars("--ink", "--text", "--fg", "--foreground") || toHex(probe.body?.color) || toHex(ranked(probe.textColors)[0]?.[0]) || "#111111";
  const texts = ranked(probe.textColors).map(([color]) => toHex(color)).filter(Boolean);
  const primaryBg = toHex(probe.primary?.["background-color"]);
  const radii = ranked(probe.radii).map(([radius]) => radius);
  const square = probe.attrs.corners === "square" || radii.length === 0;
  return {
    paper,
    ink,
    muted: fromVars("--muted", "--text-secondary", "--muted-foreground") || texts.find((color) => color !== ink) || ink,
    line: fromVars("--line", "--border", "--divider") || toHex(probe.input?.["border-top-color"]) || "#dddddd",
    wash: fromVars("--wash", "--muted-bg", "--bg-subtle"),
    accent: fromVars("--action", "--accent", "--primary", "--brand") || primaryBg || ink,
    accentFill: fromVars("--action-fill") || primaryBg || null,
    onAccent: fromVars("--on-action", "--accent-foreground", "--on-primary") || toHex(probe.primary?.color) || paper,
    font: (probe.body?.["font-family"] || "").trim(),
    corners: square ? "square" : "rounded",
    radius: square ? "0px" : (probe.input?.["border-top-left-radius"] || probe.button?.["border-top-left-radius"] || radii[0] || "6px"),
    weights: ranked(probe.weights).map(([weight]) => Number(weight)).sort((a, b) => a - b),
  };
}

async function analyseIcon(browser, file) {
  if (!file || !fs.existsSync(file)) return null;
  const page = await browser.newPage();
  const result = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const N = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = N;
    const g = canvas.getContext("2d");
    g.drawImage(image, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    let transparent = 0;
    let minX = N; let minY = N; let maxX = 0; let maxY = 0;
    const buckets = {};
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const i = (y * N + x) * 4;
        if (d[i + 3] < 16) { transparent += 1; continue; }
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        if (d[i + 3] < 200) continue;
        const key = [0, 1, 2].map((j) => d[i + j] >> 4).join(",");
        const bucket = (buckets[key] = buckets[key] || { n: 0, r: 0, g: 0, b: 0 });
        bucket.n += 1; bucket.r += d[i]; bucket.g += d[i + 1]; bucket.b += d[i + 2];
      }
    }
    const hex = (b) => `#${[b.r, b.g, b.b].map((t) => Math.round(t / b.n).toString(16).padStart(2, "0")).join("")}`;
    const colours = Object.values(buckets).sort((a, b) => b.n - a.n).slice(0, 6).map((b) => ({ hex: hex(b), share: +(b.n / (N * N)).toFixed(3) }));
    let diagonal = 0;
    while (diagonal < N / 2 && d[((minY + diagonal) * N + (minX + diagonal)) * 4 + 3] < 16) diagonal += 1;
    return { transparentShare: +(transparent / (N * N)).toFixed(3), transparentCorners: d[3] < 16, bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, diagonal, colours };
  }, fileToDataUrl(file));
  await page.close();
  const tile = result.colours[0]?.hex;
  return {
    file,
    ...result,
    inset: Math.min(result.bbox.x, result.bbox.y),
    // a corner of radius r leaves r·(1 − 1/√2) transparent pixels along the diagonal
    tileRadius: Math.round(result.diagonal / (1 - Math.SQRT1_2)),
    tile,
    // the glyph: of the colours covering ≥ 2 %, the one contrasting most with the tile
    glyph: result.colours.slice(1).filter((c) => c.share >= 0.02).sort((a, b) => contrast(b.hex, tile) - contrast(a.hex, tile))[0]?.hex || null,
  };
}

async function style(options) {
  const extDir = path.resolve(options._[0] || ".");
  const manifest = readManifest(extDir);
  const entries = entryPages(manifest);
  const entry = options.page ? { kind: "page", path: options.page } : entries[0];
  if (!entry) throw new Error("no side panel, popup or options page in manifest.json; pass --page FILE");
  const outDir = path.resolve(options.out || path.join(assetsDir(extDir), "working", "visuals"));
  fs.mkdirSync(outDir, { recursive: true });
  const viewport = entry.kind === "sidepanel" ? { width: 400, height: 720 } : entry.kind === "popup" ? { width: 380, height: 600 } : { width: 1280, height: 800 };

  const result = { extension: {}, entry, system: "custom", light: null, dark: null, darkSupported: false, icon: null };
  const browser = await launchBrowser();
  try {
    for (const scheme of ["light", "dark"]) {
      const session = await openExtensionPage(browser, { root: extDir, pagePath: entry.path, locale: options.locale, viewport, colorScheme: scheme, deviceScaleFactor: 2 });
      await session.page.waitForTimeout(900);
      const probe = await session.page.evaluate(probeInPage);
      result[scheme] = tokensFromProbe(probe);
      await session.page.screenshot({ path: path.join(outDir, `ui-${scheme}.png`) });
      flattenPng(path.join(outDir, `ui-${scheme}.png`));
      if (scheme === "light") {
        result.system = probe.vars["--paper"] && probe.vars["--ink"] && (probe.vars["--action"] || probe.vars["--wash"]) ? "xxd-ui" : "custom";
        if (session.errors.length) result.pageErrors = [...new Set(session.errors)].slice(0, 5);
      }
      await session.close();
    }
    result.icon = await analyseIcon(browser, iconPath(extDir, manifest, 128));
  } finally {
    await browser.close();
  }
  if (result.icon) {
    result.icon.sourceSvg = ["icons/icon-source.svg", "icons/icon.svg", "icon.svg", "assets/icon.svg"]
      .map((file) => path.join(extDir, file)).find((file) => fs.existsSync(file)) || null;
  }
  const L = result.light;
  const D = result.dark;
  result.darkSupported = L.paper !== D.paper || L.ink !== D.ink;
  result.extension = {
    dir: extDir, ...extensionText(extDir, options.locale), defaultLocale: manifest.default_locale || null, locales: listLocales(extDir),
    permissions: manifest.permissions || [], hostPermissions: manifest.host_permissions || [],
    contentScriptMatches: [...new Set((manifest.content_scripts || []).flatMap((script) => script.matches || []))],
    entries,
  };
  fs.writeFileSync(path.join(outDir, "style.json"), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "tokens.css"), `/* read from the extension's own UI by \`xxd-chrome-publish style\`; promo tiles use only these */
:root{
  --paper:${L.paper};--ink:${L.ink};--muted:${L.muted};--line:${L.line};--wash:${L.wash || L.line};
  --accent:${L.accent};--accent-fill:${L.accentFill || L.accent};--on-accent:${L.onAccent};
  --radius:${L.radius};--font:${L.font || '-apple-system,"PingFang SC",sans-serif'};
  --dark-paper:${D.paper};--dark-ink:${D.ink};--dark-muted:${D.muted};--dark-line:${D.line};--dark-accent:${D.accent};
  --icon-tile:${result.icon?.tile || L.ink};--icon-glyph:${result.icon?.glyph || L.paper};
}
`);
  const describe = (t) => `paper ${t.paper} · ink ${t.ink} · muted ${t.muted} · line ${t.line} · accent ${t.accent} · ${t.corners}${t.corners === "rounded" ? ` ${t.radius}` : ""} · weights ${t.weights.join("/")}`;
  say(`  extension  ${result.extension.name}  (${entry.kind}: ${entry.path})`);
  say(`  system     ${result.system}`);
  say(`  light      ${describe(L)}`);
  say(`  dark       ${result.darkSupported ? describe(D) : "no dark theme (same as light)"}`);
  say(`  font       ${L.font}`);
  const icon = result.icon;
  say(icon
    ? `  icon       tile ${icon.tile} · glyph ${icon.glyph} · inset ${icon.inset}px · corner r≈${icon.tileRadius}px · transparent corners ${icon.transparentCorners}${icon.sourceSvg ? ` · source ${path.relative(extDir, icon.sourceSvg)}` : ""}`
    : "  icon       none in manifest.json");
  say(`  locales    ${result.extension.locales.join(" ") || "(none)"}`);
  if (result.pageErrors) say(`  warning    page errors, style may be partial: ${result.pageErrors.join(" | ")}`);
  say(`  => ${outDir}: style.json, tokens.css, ui-light.png, ui-dark.png`);
  return 0;
}

// ---------- icon ----------

async function icon(options) {
  const source = options.svg || options.png;
  if (!source) throw new Error("icon needs --svg FILE (or --png FILE to keep a bitmap icon)");
  const extDir = options._[0] ? path.resolve(options._[0]) : null;
  const svg = path.resolve(source);
  const small = options.svgSmall ? path.resolve(options.svgSmall) : svg;
  const outDir = path.resolve(options.out || (extDir ? path.join(assetsDir(extDir), "working", "visuals", "icons") : "icons"));
  fs.mkdirSync(outDir, { recursive: true });
  const compare = (options.compare || []).map((file) => path.resolve(file)).filter((file) => fs.existsSync(file));
  const files = {};
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
    for (const size of [16, 32, 48, 128]) {
      await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="${fileToDataUrl(size <= 32 ? small : svg)}" width="${size}" height="${size}" style="display:block"></body></html>`);
      await page.evaluate(() => document.getElementById("i").decode());
      files[size] = path.join(outDir, `icon${size}.png`);
      await page.screenshot({ path: files[size], clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
    }
    // the store icon sits on the store's white page: flatten it, no alpha
    files.store = path.join(outDir, "store-icon-128.png");
    flattenPng(files[128], { out: files.store, background: "#ffffff" });

    const url = (file) => fileToDataUrl(file);
    const bar = (background, color, label) => `
      <section style="background:${background};color:${color}"><span class="label">${label}</span><div class="row">
        <figure><img src="${url(files[16])}" width="16" height="16"><figcaption>16</figcaption></figure>
        <figure><img src="${url(files[32])}" width="16" height="16"><figcaption>16@2x</figcaption></figure>
        <figure><img src="${url(files[32])}" width="32" height="32"><figcaption>32</figcaption></figure>
        <figure><img src="${url(files[48])}" width="48" height="48"><figcaption>48</figcaption></figure>
        <figure><img src="${url(files[128])}" width="128" height="128"><figcaption>128</figcaption></figure>
        <figure><img src="${url(files[16])}" width="64" height="64" style="image-rendering:pixelated"><figcaption>16 ×4</figcaption></figure>
      </div></section>`;
    const family = compare.length ? `
      <section style="background:#ffffff;color:#3b3a36"><span class="label">Next to the family (new one first)</span><div class="row">
        ${[files[128], ...compare].map((file, index) => `<figure><img src="${url(file)}" width="72" height="72" style="${index ? "" : "outline:1px dashed #b5b2ab;outline-offset:4px"}"><figcaption>${index ? escapeHtml(path.basename(path.dirname(path.dirname(file)))).slice(0, 16) : "new"}</figcaption></figure>`).join("")}
      </div></section>` : "";
    files.preview = path.join(outDir, "icon-preview.png");
    await browser.close().catch(() => {});
    await renderHtml(`<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;width:760px;font:12px -apple-system,"PingFang SC",sans-serif;background:#f4f3f0}
      section{padding:20px 24px}.label{display:block;margin-bottom:14px;opacity:.7}
      .row{display:flex;align-items:flex-end;gap:28px;flex-wrap:wrap}figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}
      figcaption{opacity:.6;font-size:11px}
    </style></head><body>
      <header style="padding:20px 24px 4px;font-size:14px;color:#1f1e1a">${escapeHtml(options.name || path.basename(svg))}</header>
      ${bar("#ffffff", "#3b3a36", "Chrome toolbar, light")}${bar("#3c3c3c", "#e3e3e3", "Chrome toolbar, dark")}${family}
    </body></html>`, files.preview, { width: 760, height: 400, fullPage: true, background: "#f4f3f0" });
  } finally {
    await browser.close().catch(() => {});
  }
  for (const size of [16, 32, 48, 128]) say(`  icon       icon${size}.png`);
  say("  store      store-icon-128.png (24-bit, white background)");
  if (extDir) {
    const upload = path.join(assetsDir(extDir), "upload-files");
    fs.mkdirSync(upload, { recursive: true });
    fs.copyFileSync(files.store, path.join(upload, "store-icon-128.png"));
    say(`             copied to ${upload}`);
  }
  say("  preview    icon-preview.png ← look at it: 16 px legibility, light/dark toolbar, family fit");
  if (options.install) {
    if (!extDir) throw new Error("--install needs the extension directory: icon <dir> --svg FILE --install");
    const manifest = readManifest(extDir);
    const targets = { ...(manifest.icons || {}) };
    if (manifest.action?.default_icon && typeof manifest.action.default_icon === "object") Object.assign(targets, manifest.action.default_icon);
    const backup = path.join(outDir, "icons-backup");
    fs.mkdirSync(backup, { recursive: true });
    for (const [size, relative] of Object.entries(targets)) {
      if (!files[size]) { say(`  skip       ${relative}: no ${size}px render`); continue; }
      const target = path.join(extDir, relative);
      if (fs.existsSync(target)) fs.copyFileSync(target, path.join(backup, `${size}-${path.basename(relative)}`));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(files[size], target);
      say(`  installed  ${relative}`);
    }
    say(`  backup     originals in ${backup}`);
  }
  say(`  => ${outDir}`);
  return 0;
}

// ---------- tile ----------

async function tile(options) {
  const html = options._[0] && path.resolve(options._[0]);
  if (!html || !options.out || !options.size) throw new Error("usage: tile FILE.html --size WxH --out FILE.png");
  const [W, H] = String(options.size).split("x").map(Number);
  const out = path.resolve(options.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const minFont = H <= 300 ? 14 : 16;
  const styleFile = path.join(path.dirname(html), "style.json");
  const styleJson = fs.existsSync(styleFile) ? JSON.parse(fs.readFileSync(styleFile, "utf8")) : null;
  const weights = styleJson ? (styleJson.system === "xxd-ui" ? ["400", "500", "600"] : styleJson.light.weights.map(String)) : null;
  let problems = [];
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: options.scheme || "light" });
    const page = await context.newPage();
    await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    problems = await page.evaluate(({ W, H, minFont, weights }) => {
      const found = [];
      const label = (element) => `${element.id ? `#${element.id}` : typeof element.className === "string" && element.className ? `.${element.className.split(/\s+/)[0]}` : element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 24)}"`;
      for (const element of document.querySelectorAll("body *")) {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if ([...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())) {
          const rect = element.getBoundingClientRect();
          if (rect.right > W + 0.5 || rect.bottom > H + 0.5 || rect.left < -0.5 || rect.top < -0.5) found.push(`text out of frame: ${label(element)}`);
          if (element.scrollWidth > element.clientWidth + 1 && style.overflow !== "visible") found.push(`text clipped: ${label(element)}`);
          if (parseFloat(style.fontSize) < minFont && !element.closest("[data-allow-small]")) found.push(`font ${style.fontSize} < ${minFont}px: ${label(element)}`);
          if (weights && !weights.includes(style.fontWeight)) found.push(`font-weight ${style.fontWeight} isn't used in the UI (${weights.join("/")}): ${label(element)}`);
        }
        if (element.hasAttribute("data-one-line")) {
          // count line boxes, not element height (grid and flex items get stretched)
          const range = document.createRange();
          range.selectNodeContents(element);
          const lines = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
          if (lines.size > 1) found.push(`wraps to ${lines.size} lines: ${label(element)}`);
        }
        if (element.tagName === "IMG" && !(element.complete && element.naturalWidth)) found.push(`image not loaded: ${element.getAttribute("src")}`);
      }
      return [...new Set(found)];
    }, { W, H, minFont, weights });
    await page.screenshot({ path: out });
    await context.close();
  } finally {
    await browser.close();
  }
  flattenPng(out);
  const info = pngInfo(out);
  say(`  tile       ${path.basename(out)}  ${info.width}×${info.height}  ${info.hasAlpha ? "ALPHA" : "24-bit"}  ${Math.round(info.bytes / 1024)} KB`);
  for (const problem of problems) say(`  problem    ${problem}`);
  return problems.length ? 1 : 0;
}

// ---------- images ----------

const SPEC = [
  { re: /^store-icon-128\.png$/, sizes: [[128, 128]], kind: "icon" },
  { re: /^promo-small-440x280\.(png|jpe?g)$/, sizes: [[440, 280]], kind: "small" },
  { re: /^promo-marquee-1400x560\.(png|jpe?g)$/, sizes: [[1400, 560]], kind: "marquee" },
  { re: /^screenshots\/(?!00-).+\.(png|jpe?g)$/, sizes: [[1280, 800], [640, 400]], kind: "shot" },
];

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file, base) : [path.relative(base, file).split(path.sep).join("/")];
  });
}

/** Group upload-files/ by language ('' = default) and check sizes and alpha. */
export function checkUploadFiles(dir) {
  const groups = new Map();
  const rows = [];
  for (const relative of walk(dir).sort(naturally)) {
    if (!/\.(png|jpe?g)$/i.test(relative)) continue;
    const match = relative.match(/^locales\/([^/]+)\/(.+)$/);
    const locale = match ? match[1] : "";
    const spec = SPEC.find((item) => item.re.test(match ? match[2] : relative));
    if (!spec) continue;
    let status = "ok";
    let detail = "jpeg";
    if (/\.png$/i.test(relative)) {
      const info = pngInfo(path.join(dir, relative));
      detail = `${info.width}×${info.height}`;
      if (!spec.sizes.some(([w, h]) => w === info.width && h === info.height)) status = "wrong size";
      else if (info.hasAlpha) status = "has alpha";
    }
    rows.push({ status, file: relative, detail });
    const group = groups.get(locale) || { shots: [] };
    if (spec.kind === "shot") group.shots.push(relative);
    else group[spec.kind] = relative;
    groups.set(locale, group);
  }
  const base = groups.get("") || { shots: [] };
  const ordered = [...groups].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  const notes = [];
  for (const [locale, group] of ordered) {
    const missing = ["icon", "small"].filter((kind) => !(group[kind] || base[kind]));
    if (!group.shots.length && !base.shots.length) missing.push("screenshots");
    // the store shows up to five; fewer leaves room unused, more won't upload
    const shotCount = (group.shots.length ? group.shots : base.shots).length;
    if (shotCount && shotCount < 5) notes.push(`${locale || "default language"}: ${shotCount} screenshot${shotCount > 1 ? "s" : ""} — the store shows up to 5`);
    if (shotCount > 5) notes.push(`${locale || "default language"}: ${shotCount} screenshots — the store takes at most 5`);
    if (missing.length) notes.push(`missing${locale ? ` (${locale})` : ""}: ${missing.join(", ")}`);
    // promo tiles carry text: another language borrowing the default one should be a choice
    const borrowed = locale ? ["small", "marquee"].filter((kind) => !group[kind] && base[kind]) : [];
    if (borrowed.length) notes.push(`${locale}: uses the default-language ${borrowed.join(" & ")} tile (its text isn't ${locale})`);
  }
  return { rows, ordered, base, notes };
}

async function images(options) {
  const target = path.resolve(options._[0] || ".");
  const dir = fs.existsSync(path.join(target, "manifest.json")) ? path.join(assetsDir(target), "upload-files") : target;
  if (!fs.existsSync(dir)) throw new Error(`${dir} doesn't exist yet — make the screenshots, icon and tiles first`);
  const board = path.resolve(options.board || path.join(dir, "..", "working", "visuals", "00-visual-board.png"));
  const { rows, ordered, base, notes } = checkUploadFiles(dir);
  for (const row of rows) say(`  ${row.status.padEnd(10)} ${row.file}  ${row.detail}`);
  if (!rows.length) say("  (no store images found)");
  for (const note of notes) say(`  note       ${note}`);
  if (ordered.length) {
    const url = (relative) => fileToDataUrl(path.join(dir, relative));
    const section = (locale, group) => {
      const pick = (kind) => group[kind] || base[kind];
      const shotsList = group.shots.length ? group.shots : base.shots;
      return `<section><h2>${locale ? escapeHtml(locale) : "default language"}</h2>
        ${pick("marquee") ? `<img class="marquee" src="${url(pick("marquee"))}">` : '<div class="empty marquee">no marquee</div>'}
        <div class="head">${pick("icon") ? `<img src="${url(pick("icon"))}" width="64" height="64">` : ""}
          ${pick("small") ? `<img class="small" src="${url(pick("small"))}">` : '<div class="empty small">no small tile</div>'}</div>
        <div class="shots">${shotsList.map((shot) => `<img src="${url(shot)}">`).join("")}</div></section>`;
    };
    await renderHtml(`<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;width:1480px;background:#f4f3f0;font:13px -apple-system,"PingFang SC",sans-serif;color:#3b3a36}
      section{padding:40px}h2{margin:0 0 16px;font-size:16px;font-weight:500}
      img{display:block;border:1px solid #dddad3}.marquee{width:1400px;height:560px}
      .head{display:flex;gap:32px;align-items:flex-start;margin:28px 0}.small{width:440px;height:280px}
      .shots{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.shots img{width:100%}
      .empty{display:flex;align-items:center;justify-content:center;border:1px dashed #b5b2ab;color:#8a877f}
    </style></head><body>${ordered.map(([locale, group]) => section(locale, group)).join("")}</body></html>`,
    board, { width: 1480, height: 900, fullPage: true, background: "#f4f3f0" });
    say(`  board      ${board} ← look at it: one product, one set of colours and corners`);
  }
  return rows.some((row) => row.status !== "ok") ? 1 : 0;
}

export async function runVisualCommand(command, argv) {
  const options = parseVisualArgs(argv);
  if (options.help) {
    say(VISUAL_HELP.trim());
    return 0;
  }
  const handlers = { shots, style, icon, tile, images, "demo-images": demoImages };
  return handlers[command](options);
}
