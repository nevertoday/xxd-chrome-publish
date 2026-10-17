// Collect the files an extension needs at runtime and zip them.
//
// The collector walks references instead of zipping the whole folder, so tests,
// sources, docs and node_modules stay out of the package. References come from
// the manifest, HTML (src/href), CSS url(), JS imports/importScripts/getURL/fetch,
// and any JS string literal that names a file that exists — which catches
// chrome.scripting.executeScript({ files: [...] }) and lazy-inject maps.
//
// Nothing references a licence file, so they are collected separately: the
// root LICENSE/NOTICE, licence files in every folder that ships code (e.g.
// vendor/qrcode.LICENSE next to vendor/qrcode.min.js, bundle.js.LICENSE.txt),
// and — for packages built from elsewhere — the project's own licence and those
// of bundled npm dependencies.

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

const LICENSE_WORD =
  /(?:^|[._-])(?:LICEN[CS]E|COPYING|NOTICE|COPYRIGHT|AUTHORS|PATENTS|THIRD[._-]?PARTY[._-]?(?:NOTICES?|LICEN[CS]ES?)?)S?(?:[._-]|$)/i;
const LICENSE_STEM = /^(?:LICEN[CS]E|COPYING|NOTICE)(?:[._-]|$)/i;
// notice.js, license.html, license-badge.png are runtime files, not licences
const ASSET_EXT = /\.(?:[cm]?jsx?|tsx?|css|s[ac]ss|less|html?|json|map|vue|svelte|png|jpe?g|gif|svg|webp|ico|bmp|avif|woff2?|ttf|otf|eot|mp3|ogg|opus|wav|m4a|webm|mp4|wasm)$/i;
const LICENSE_DIRS = /^(?:licen[cs]es|third[._-]?party[._-]?(?:licen[cs]es|notices))$/i;
const LICENSE_TEXT_EXT = new Set(["", "txt", "md", "markdown", "rst"]);
// Third-party code: minified files or anything under a vendor-style folder.
const VENDORED = /(?:\.min\.(?:m?js|css)$|(?:^|\/)(?:vendor|vendors|third[_-]?party|external|libs?\/(?:[^/]+\/)*[^/]+\.min\.))/i;
const HEADER_LICENSE = /@licen[cs]e|@preserve|licen[cs]ed under|copyright|\(c\)\s*\d{4}|SPDX-License-Identifier/i;

/** LICENSE, NOTICE.md, COPYING, qrcode.LICENSE, bundle.js.LICENSE.txt, THIRD_PARTY_NOTICES … */
export function isLicenseFile(name) {
  const base = path.posix.basename(String(name));
  if (ASSET_EXT.test(base)) return false;
  if (LICENSE_STEM.test(base)) return true;
  if (!LICENSE_WORD.test(base)) return false;
  const ext = path.posix.extname(base).slice(1).toLowerCase();
  return LICENSE_TEXT_EXT.has(ext) || LICENSE_WORD.test(`.${ext}`);
}

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
    // Template literals: `editor/editor.html?file=${x}` names the file before the
    // query; `core/i18n/${lang}.js` names every file of that shape in the folder.
    for (const match of content.matchAll(/`([^`]*\$\{[^`]*)`/g)) {
      const raw = match[1];
      const head = raw.slice(0, raw.indexOf("${"));
      const query = head.search(/[?#]/);
      if (query > 0) {
        const hit = [normalizeRelative(head.slice(0, query)), resolveFrom(file, head.slice(0, query))]
          .find((candidate) => candidate && exists(candidate) && fs.statSync(path.join(rootDir, candidate)).isFile());
        if (hit) addFile(hit);
        continue;
      }
      const slash = head.lastIndexOf("/");
      const tail = raw.slice(raw.lastIndexOf("}") + 1).match(/^([\w.-]*\.[a-z0-9]+)(?:[?#]|$)/i);
      if (slash <= 0 || !tail) continue;
      const prefix = head.slice(slash + 1);
      const dir = [normalizeRelative(head.slice(0, slash)), resolveFrom(file, head.slice(0, slash))]
        .find((candidate) => candidate && exists(candidate) && fs.statSync(path.join(rootDir, candidate)).isDirectory());
      if (!dir) continue;
      for (const entry of fs.readdirSync(path.join(rootDir, dir), { withFileTypes: true })) {
        if (entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(tail[1]) && entry.name.length > prefix.length + tail[1].length) {
          addFile(`${dir}/${entry.name}`);
        }
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

  // Licence files: in the root and in every folder (and its parents) that ships
  // a file. Nothing references them, so the walk above never finds them.
  const folders = new Set([""]);
  for (const file of files) {
    for (let dir = path.posix.dirname(file); dir !== "."; dir = path.posix.dirname(dir)) folders.add(dir);
  }
  for (const dir of folders) {
    const absolute = path.join(rootDir, dir);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || EXCLUDED_NAMES.has(entry.name)) continue;
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isFile() && isLicenseFile(entry.name)) {
        addFile(relative);
      } else if (entry.isDirectory() && LICENSE_DIRS.test(entry.name)) {
        walk(rootDir, relative, addFile);
      }
    }
  }

  // Third-party files with no licence beside them, in a parent folder below the
  // root, or in their own header comment.
  const unlicensed = [];
  const all = Array.from(files);
  for (const file of all) {
    if (!VENDORED.test(file) || isLicenseFile(file)) continue;
    const stem = path.posix.basename(file).replace(/(?:\.min)?\.(?:m?js|css)$/i, "").toLowerCase();
    let covered = false;
    for (let dir = path.posix.dirname(file); dir !== "." && !covered; dir = path.posix.dirname(dir)) {
      covered = all.some((other) => {
        if (path.posix.dirname(other) !== dir || !isLicenseFile(other)) return false;
        const base = path.posix.basename(other).toLowerCase();
        // a folder-wide LICENSE, or one named after this file (qrcode.LICENSE)
        return LICENSE_STEM.test(base) || base.startsWith(stem) || dir !== path.posix.dirname(file);
      });
    }
    if (!covered) {
      const head = fs.readFileSync(path.join(rootDir, file)).subarray(0, 4096).toString("utf8");
      if (!HEADER_LICENSE.test(head)) unlicensed.push(file);
    }
  }

  const licenses = all.filter((file) => isLicenseFile(file) || file.split("/").some((part) => LICENSE_DIRS.test(part)));
  return { files: all.sort(), missing, licenses: licenses.sort(), unlicensed };
}

/**
 * Licence files that live outside the package folder: the project's own
 * LICENSE/NOTICE when the package is a build output (`packageDir`), and those
 * of npm `dependencies` a build bundles. Returns ZIP entries to add.
 *
 * @param {{projectRoot?: string, packageRoot: string, bundled?: boolean, have: string[]}} options
 */
export function externalLicenses({ projectRoot, packageRoot, bundled = false, have = [] }) {
  const entries = [];
  if (!projectRoot) return entries;
  const taken = new Set(have.map((name) => name.toLowerCase()));
  const topLevel = (dir) => (fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && isLicenseFile(entry.name)).map((entry) => entry.name).sort()
    : []);

  // Find the project's own package.json / LICENSE: projectRoot or a parent,
  // stopping at the repository root.
  let base = path.resolve(projectRoot);
  for (let dir = base; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json")) || topLevel(dir).length) {
      base = dir;
      break;
    }
    if (fs.existsSync(path.join(dir, ".git")) || path.dirname(dir) === dir) break;
  }

  if (path.resolve(base) !== path.resolve(packageRoot)) {
    for (const name of topLevel(base)) {
      if (taken.has(name.toLowerCase())) continue;
      entries.push({ name, source: path.join(base, name) });
      taken.add(name.toLowerCase());
    }
  }

  if (!bundled) return entries;
  let dependencies = {};
  try {
    dependencies = JSON.parse(fs.readFileSync(path.join(base, "package.json"), "utf8")).dependencies || {};
  } catch {
    return entries;
  }
  for (const dependency of Object.keys(dependencies).sort()) {
    const flat = dependency.replace(/^@/, "").replace(/\//g, "-").toLowerCase();
    // already shipped by the project (vendor/qrcode.LICENSE for "qrcode")
    if (have.some((name) => isLicenseFile(name) && path.posix.basename(name).toLowerCase().startsWith(flat))) continue;
    const dir = path.join(base, "node_modules", dependency);
    for (const name of topLevel(dir)) {
      const target = `licenses/${flat}/${name}`;
      if (taken.has(target.toLowerCase())) continue;
      entries.push({ name: target, source: path.join(dir, name) });
      taken.add(target.toLowerCase());
    }
  }
  return entries;
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

/**
 * The locales a store visitor on this machine is shown, best first: the store
 * picks the listing whose locale matches the browser language, then falls back
 * to default_locale. --lang (via XXD_CHROME_PUBLISH_LANG) wins over LC_ALL/LANG.
 */
export function viewerLocales(env = process.env) {
  const raw = String(env.XXD_CHROME_PUBLISH_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG || "")
    .split(/[.@:]/)[0].replace("-", "_");
  const [language, region] = raw.split("_");
  if (!language || language === "C" || language === "POSIX") return [];
  const lang = language.toLowerCase();
  const fallbackRegion = { zh: "CN", en: "US", pt: "BR", es: "419" }[lang];
  const regions = [region?.toUpperCase(), fallbackRegion].filter(Boolean);
  return [...new Set([...regions.map((code) => `${lang}_${code}`), lang])];
}

/**
 * The extension's name as the Chrome Web Store shows it once submitted: the
 * localized manifest name for the visitor's language (default_locale when that
 * language has no listing), exactly as written.
 */
export function displayName(rootDir, manifest, locales = viewerLocales()) {
  const name = String(manifest.name || "").trim();
  const key = /^__MSG_([A-Za-z0-9_@]+)__$/.exec(name)?.[1];
  if (!key) return name;
  let folders = [];
  try {
    folders = fs.readdirSync(path.join(rootDir, "_locales"));
  } catch {
    return "";
  }
  const pick = (locale) => folders.find((folder) => folder.toLowerCase() === String(locale).toLowerCase());
  const order = [...locales, manifest.default_locale, "en", "en_US"].filter(Boolean).map(pick).filter(Boolean);
  for (const locale of [...new Set(order)]) {
    try {
      const messages = JSON.parse(fs.readFileSync(path.join(rootDir, "_locales", locale, "messages.json"), "utf8").replace(/^\uFEFF/, ""));
      const hit = Object.keys(messages || {}).find((entry) => entry.toLowerCase() === key.toLowerCase());
      const message = hit && messages[hit]?.message;
      if (message) return String(message).trim();
    } catch {
      // try next locale
    }
  }
  return "";
}

/** A file name that keeps the store name as shown; only characters no file system allows are replaced. */
function safeBaseName(name) {
  return (
    String(name || "")
      .replace(/\.zip$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^[.\s]+|[.\s]+$/g, "") || "chrome-extension"
  );
}

/**
 * Package an extension directory into a ZIP. The source manifest is never
 * modified; `version` is written into the packaged copy only.
 */
export function packageExtension(rootDir, { version, outputDir, zipName, include, exclude, projectRoot, bundled, locales } = {}) {
  const manifestPath = path.join(rootDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`no manifest.json in ${rootDir}`);
  }
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const finalVersion = version || manifest.version;
  const collected = collectFiles(rootDir, manifest, { include, exclude });
  const external = externalLicenses({ projectRoot, packageRoot: rootDir, bundled, have: collected.files });

  const entries = collected.files.map((file) => ({
    name: file,
    data:
      file === "manifest.json"
        ? Buffer.from(setManifestVersionText(manifestText, finalVersion), "utf8")
        : fs.readFileSync(path.join(rootDir, file)),
  }));
  for (const entry of external) entries.push({ name: entry.name, data: fs.readFileSync(entry.source) });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files = entries.map((entry) => entry.name);
  const licenses = [...collected.licenses, ...external.map((entry) => entry.name)].sort();
  const zip = createZip(entries);
  // Named after the store title the user will see, so the file and the listing match.
  const name = displayName(rootDir, manifest, locales) || path.basename(rootDir);
  const base = safeBaseName(zipName || name);
  fs.mkdirSync(outputDir, { recursive: true });
  const zipPath = path.join(outputDir, `${base} v${finalVersion}.zip`);
  fs.writeFileSync(zipPath, zip);
  return {
    zipPath, name, files, missing: collected.missing, licenses, unlicensed: collected.unlicensed,
    size: zip.length, version: finalVersion,
  };
}
