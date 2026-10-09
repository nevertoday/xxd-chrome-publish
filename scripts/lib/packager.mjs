// Collect the files an extension needs at runtime and zip them.
//
// The collector walks references instead of zipping the whole folder, so tests,
// sources, docs and node_modules stay out of the package. References come from
// the manifest, HTML (src/href), CSS url(), JS imports/importScripts/getURL/fetch,
// and any JS string literal that names a file that exists — which catches
// chrome.scripting.executeScript({ files: [...] }) and lazy-inject maps.

import fs from "node:fs";
import path from "node:path";
import { createZip } from "./zip.mjs";

const EXCLUDED_NAMES = new Set([".git", ".svn", ".hg", "node_modules", ".DS_Store", "Thumbs.db"]);
const TEXT_EXTENSIONS = new Set([".css", ".htm", ".html", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const ROOT_FALLBACK_EXTENSIONS = new Set([
  ".css", ".gif", ".htm", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json", ".mjs",
  ".png", ".svg", ".webp", ".woff", ".woff2", ".ttf",
]);
// Root files that look like runtime files but are tooling config.
const ROOT_TOOLING_FILE =
  /^(?:package(?:-lock)?\.json|tsconfig.*\.json|jsconfig\.json|\.?eslintrc.*|.*\.config\.(?:c|m)?js|vite\.config\..*|webpack\..*|rollup\..*|babel\.config\..*|jest\.config\..*|vitest\.config\..*|playwright\.config\..*|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock|\.chrome-publish\.json)$/i;
const LITERAL_PATH =
  /["'`](\.{0,2}\/?[\w@][\w@.\-/]*\.(?:js|mjs|css|html?|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp3|ogg|opus|wav|m4a|webm|mp4|wasm|txt))["'`]/g;

export function globToRegExp(glob) {
  let pattern = "";
  const source = String(glob).replace(/^\.\//, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "*") {
      if (source[index + 1] === "*") {
        pattern += source[index + 2] === "/" ? "(?:.*/)?" : ".*";
        index += source[index + 2] === "/" ? 2 : 1;
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  // "dir/" or "dir" also matches everything under it
  return new RegExp(`^${pattern.replace(/\/$/, "")}(?:/.*)?$`);
}

function normalizeRelative(value) {
  if (!value) return null;
  let result = String(value).replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
  result = path.posix.normalize(result);
  if (!result || result === "." || result === ".." || result.startsWith("../")) return null;
  return result;
}

function stripQueryAndHash(value) {
  return String(value).split("#", 1)[0].split("?", 1)[0];
}

function isExternal(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
}

/**
 * @param {string} rootDir
 * @param {object} manifest
 * @param {{include?: string[], exclude?: string[]}} [options]
 * @returns {{files: string[], missing: {from: string, ref: string}[]}}
 */
export function collectFiles(rootDir, manifest, options = {}) {
  const files = new Set();
  const queue = [];
  const parsed = new Set();
  const missing = [];
  const excludes = (options.exclude || []).map(globToRegExp);
  const isExcluded = (relative) => excludes.some((regex) => regex.test(relative));
  const exists = (relative) => fs.existsSync(path.join(rootDir, relative));

  function addFile(relative) {
    const normalized = normalizeRelative(relative);
    if (!normalized || files.has(normalized) || isExcluded(normalized)) return;
    const absolute = path.join(rootDir, normalized);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return;
    files.add(normalized);
    queue.push(normalized);
  }

  function addDirectory(relative) {
    const normalized = normalizeRelative(relative);
    if (!normalized) return;
    const absolute = path.join(rootDir, normalized);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (EXCLUDED_NAMES.has(entry.name) || entry.name.startsWith(".")) continue;
      const child = path.posix.join(normalized, entry.name);
      if (entry.isDirectory()) addDirectory(child);
      else if (entry.isFile()) addFile(child);
    }
  }

  function addPath(value) {
    const normalized = normalizeRelative(stripQueryAndHash(value));
    if (!normalized) return;
    if (!normalized.includes("*")) {
      const absolute = path.join(rootDir, normalized);
      if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) addDirectory(normalized);
      else addFile(normalized);
      return;
    }
    const prefix = normalizeRelative(normalized.split("*", 1)[0].replace(/\/+$/, ""));
    if (prefix) addPath(prefix);
  }

  // Manifest references should exist. Chrome refuses to load an extension whose
  // service worker, content scripts, icons or rule files are missing ("error");
  // a missing popup or web-accessible resource only breaks that feature ("warning").
  const FATAL = /^(?:background|content_scripts|icons|action\.default_icon|browser_action\.default_icon|declarative_net_request|default_locale)/;
  function addRequired(value, from) {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach((item) => addRequired(item, from));
    if (typeof value === "object") return Object.values(value).forEach((item) => addRequired(item, from));
    const cleaned = stripQueryAndHash(value);
    if (isExternal(cleaned)) return;
    const normalized = normalizeRelative(cleaned);
    if (!normalized) return;
    if (!normalized.includes("*") && !exists(normalized)) {
      missing.push({ from, ref: normalized, severity: FATAL.test(from) ? "error" : "warning" });
      return;
    }
    addPath(normalized);
  }

  function resolveFrom(fromFile, reference) {
    const trimmed = String(reference || "").trim().replace(/^['"]|['"]$/g, "");
    if (!trimmed || isExternal(trimmed)) return null;
    const cleaned = stripQueryAndHash(trimmed);
    if (!cleaned) return null;
    if (cleaned.startsWith("/")) return normalizeRelative(cleaned);
    const base = path.posix.dirname(fromFile);
    return normalizeRelative(base === "." ? cleaned : path.posix.join(base, cleaned));
  }

  function scanHtml(file, content) {
    for (const match of content.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
      const next = resolveFrom(file, match[1]);
      if (next) addPath(next);
    }
  }

  function scanCss(file, content) {
    for (const match of content.matchAll(/url\(([^)]+)\)/gi)) {
      const next = resolveFrom(file, match[1]);
      if (next) addPath(next);
    }
    for (const match of content.matchAll(/@import\s+["']([^"']+)["']/gi)) {
      const next = resolveFrom(file, match[1]);
      if (next) addPath(next);
    }
  }

  function scanJs(file, content) {
    const patterns = [
      /(?:import\s+(?:[^"'`]+\s+from\s+)?|export\s+[^"'`]+\s+from\s+)["']([^"']+)["']/g,
      /\bimport\(\s*["']([^"']+)["']\s*\)/g,
      /chrome\.runtime\.getURL\(\s*["']([^"']+)["']\s*\)/g,
      /\bfetch\(\s*["']([^"']+)["']/g,
      /\b(?:url|path)\s*:\s*["']([^"']+)["']/g,
    ];
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        const next = resolveFrom(file, match[1]);
        if (next) addPath(next);
      }
    }
    for (const call of content.matchAll(/\bimportScripts\s*\(([^)]*)\)/g)) {
      for (const raw of call[1].match(/["']([^"']+)["']/g) || []) {
        const next = resolveFrom(file, raw);
        if (next) addPath(next);
      }
    }
    // Extension APIs resolve bare paths from the extension root, so try that first.
    for (const match of content.matchAll(LITERAL_PATH)) {
      const raw = match[1];
      const candidates = raw.startsWith(".")
        ? [resolveFrom(file, raw)]
        : [normalizeRelative(raw), resolveFrom(file, raw)];
      const hit = candidates.find((candidate) => candidate && exists(candidate));
      if (hit) addFile(hit);
    }
  }

  function drain() {
    while (queue.length) {
      const file = queue.shift();
      if (parsed.has(file)) continue;
      parsed.add(file);
      const extension = path.extname(file).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension) || extension === ".json") continue;
      const content = fs.readFileSync(path.join(rootDir, file), "utf8");
      if (extension === ".html" || extension === ".htm") scanHtml(file, content);
      else if (extension === ".css") scanCss(file, content);
      else scanJs(file, content);
    }
  }

  addFile("manifest.json");
  addRequired(manifest.icons, "icons");
  addRequired(manifest.action?.default_icon, "action.default_icon");
  addRequired(manifest.action?.default_popup, "action.default_popup");
  addRequired(manifest.browser_action?.default_icon, "browser_action.default_icon");
  addRequired(manifest.browser_action?.default_popup, "browser_action.default_popup");
  addRequired(manifest.page_action?.default_popup, "page_action.default_popup");
  addRequired(manifest.background?.service_worker, "background.service_worker");
  addRequired(manifest.background?.page, "background.page");
  addRequired(manifest.background?.scripts, "background.scripts");
  addRequired(manifest.side_panel?.default_path, "side_panel.default_path");
  addRequired(manifest.options_page, "options_page");
  addRequired(manifest.options_ui?.page, "options_ui.page");
  addRequired(manifest.devtools_page, "devtools_page");
  addRequired(manifest.chrome_url_overrides, "chrome_url_overrides");
  addRequired(manifest.sandbox?.pages, "sandbox.pages");
  for (const [index, script] of (manifest.content_scripts || []).entries()) {
    addRequired(script.js, `content_scripts[${index}].js`);
    addRequired(script.css, `content_scripts[${index}].css`);
  }
  for (const entry of manifest.web_accessible_resources || []) {
    // MV2 lists strings, MV3 lists { resources: [...] }
    addRequired(typeof entry === "string" ? entry : entry.resources, "web_accessible_resources");
  }
  for (const resource of manifest.declarative_net_request?.rule_resources || []) {
    addRequired(resource.path, "declarative_net_request");
  }
  if (manifest.default_locale) {
    if (exists("_locales")) addDirectory("_locales");
    else missing.push({ from: "default_locale", ref: "_locales/", severity: "error" });
  }

  drain();
  // Loose root files (e.g. a library loaded by a lazy inject) as a safety net.
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(".") || EXCLUDED_NAMES.has(entry.name)) continue;
    if (ROOT_TOOLING_FILE.test(entry.name)) continue;
    if (ROOT_FALLBACK_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) addFile(entry.name);
  }
  for (const pattern of options.include || []) {
    const regex = globToRegExp(pattern);
    walk(rootDir, "", (relative) => {
      if (regex.test(relative)) addFile(relative);
    });
  }
  drain();

  return { files: Array.from(files).sort(), missing };
}

function walk(rootDir, relative, visit) {
  const absolute = path.join(rootDir, relative);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (EXCLUDED_NAMES.has(entry.name) || entry.name.startsWith(".")) continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(rootDir, child, visit);
    else if (entry.isFile()) visit(child);
  }
}

/** Replace the top-level "version" value, keeping the file's formatting. */
export function setManifestVersionText(text, version) {
  const replaced = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  try {
    if (JSON.parse(replaced).version === version) return replaced;
  } catch {
    // fall through
  }
  const manifest = JSON.parse(text);
  manifest.version = version;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function displayName(rootDir, manifest) {
  const name = String(manifest.name || "").trim();
  const key = /^__MSG_([A-Za-z0-9_@]+)__$/.exec(name)?.[1];
  if (!key) return name;
  for (const locale of [manifest.default_locale, "en", "en_US"].filter(Boolean)) {
    const file = path.join(rootDir, "_locales", locale, "messages.json");
    try {
      const message = JSON.parse(fs.readFileSync(file, "utf8"))?.[key]?.message;
      if (message) return String(message).trim();
    } catch {
      // try next locale
    }
  }
  return "";
}

function safeBaseName(name) {
  return (
    String(name || "")
      .replace(/\.zip$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.\-\s]+|[.\-\s]+$/g, "") || "chrome-extension"
  );
}

/**
 * Package an extension directory into a ZIP. The source manifest is never
 * modified; `version` is written into the packaged copy only.
 */
export function packageExtension(rootDir, { version, outputDir, zipName, include, exclude } = {}) {
  const manifestPath = path.join(rootDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`no manifest.json in ${rootDir}`);
  }
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const finalVersion = version || manifest.version;
  const { files, missing } = collectFiles(rootDir, manifest, { include, exclude });

  const entries = files.map((file) => ({
    name: file,
    data:
      file === "manifest.json"
        ? Buffer.from(setManifestVersionText(manifestText, finalVersion), "utf8")
        : fs.readFileSync(path.join(rootDir, file)),
  }));
  const zip = createZip(entries);
  const base = safeBaseName(zipName || displayName(rootDir, manifest) || path.basename(rootDir));
  fs.mkdirSync(outputDir, { recursive: true });
  const zipPath = path.join(outputDir, `${base}-v${finalVersion}.zip`);
  fs.writeFileSync(zipPath, zip);
  return { zipPath, files, missing, size: zip.length, version: finalVersion };
}
