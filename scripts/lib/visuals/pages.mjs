// What a screenshot needs to know about an extension: its pages, its icon and
// its text in a given language (Chrome's own fallback: locale → language →
// default_locale).

import fs from "node:fs";
import path from "node:path";

export function readManifest(dir) {
  const file = path.join(dir, "manifest.json");
  if (!fs.existsSync(file)) throw new Error(`no manifest.json in ${dir}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function listLocales(dir) {
  const root = path.join(dir, "_locales");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((locale) => fs.existsSync(path.join(root, locale, "messages.json"))).sort();
}

function readMessages(dir, locale) {
  const file = path.join(dir, "_locales", locale || "", "messages.json");
  if (!locale || !fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value]));
}

/** Messages for `locale`, keys lower-cased, falling back like Chrome does. */
export function loadMessages(dir, locale) {
  const manifest = readManifest(dir);
  const chain = [];
  if (locale) {
    chain.push(locale);
    if (locale.includes("_")) chain.push(locale.split("_")[0]);
  }
  if (manifest.default_locale) chain.push(manifest.default_locale);
  const merged = {};
  for (const item of [...chain].reverse()) Object.assign(merged, readMessages(dir, item));
  return merged;
}

export function resolveMessage(text, messages) {
  if (typeof text !== "string") return text;
  return text.replace(/__MSG_(\w+)__/g, (whole, key) => messages[key.toLowerCase()]?.message ?? whole);
}

export function extensionText(dir, locale) {
  const manifest = readManifest(dir);
  const messages = loadMessages(dir, locale || manifest.default_locale);
  return {
    name: resolveMessage(manifest.name, messages),
    description: resolveMessage(manifest.description || "", messages),
    version: manifest.version,
  };
}

/** Pages worth capturing, most common first. */
export function entryPages(manifest) {
  const pages = [];
  if (manifest.side_panel?.default_path) pages.push({ kind: "sidepanel", path: manifest.side_panel.default_path });
  if (manifest.action?.default_popup) pages.push({ kind: "popup", path: manifest.action.default_popup });
  if (manifest.browser_action?.default_popup) pages.push({ kind: "popup", path: manifest.browser_action.default_popup });
  for (const [kind, page] of Object.entries(manifest.chrome_url_overrides || {})) pages.push({ kind, path: page });
  const options = manifest.options_ui?.page || manifest.options_page;
  if (options) pages.push({ kind: "options", path: options });
  return pages;
}

export function iconPath(dir, manifest, size = 128) {
  const actionIcon = manifest.action?.default_icon;
  const icons = { ...(actionIcon && typeof actionIcon === "object" ? actionIcon : {}), ...(manifest.icons || {}) };
  const sizes = Object.keys(icons).map(Number).sort((a, b) => b - a);
  const pick = sizes.find((value) => value === size) ?? sizes[0];
  return pick ? path.join(dir, icons[pick]) : null;
}

/** zh_CN → zh-CN */
export function toBcp47(locale) {
  return (locale || "en").replace("_", "-");
}

/**
 * Store assets live beside the ZIPs' default place, never in the source:
 * <base>/<extension folder>-store-assets/. An existing folder of that name next
 * to the extension or on the Desktop wins; otherwise it goes on the Desktop.
 */
export function storeAssetsDir(extDir, desktop) {
  const name = `${path.basename(path.resolve(extDir))}-store-assets`;
  for (const base of [path.dirname(path.resolve(extDir)), desktop]) {
    const candidate = path.join(base, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(desktop, name);
}
