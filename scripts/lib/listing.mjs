// First listing: everything the dashboard asks for before an item can be
// submitted — store text, single purpose, a justification per permission,
// remote code, data use, privacy policy, distribution, reviewer notes.
// The API can't fill any of it. This module gathers the facts the code can
// prove (where each permission is used, what is fetched from where, any
// remote code), lays out a paste-ready folder in dashboard order, one folder
// per listing language, and checks the finished folder before anyone pastes.

import fs from "node:fs";
import path from "node:path";
import { localeInfo, folderReader, DESCRIPTION_MAX } from "./locales.mjs";
import { findPermissionUsage, draftJustification } from "./manifest-diff.mjs";
import { usesSignIn } from "./first-release.mjs";

const CODE = /\.(?:m?js|cjs|html?)$/i;
const BROAD_HOSTS = /^(?:<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/;

function scan(rootDir, files, pattern, { limit = 8, perFile = 2 } = {}) {
  const hits = [];
  for (const file of files) {
    if (!CODE.test(file) || file.startsWith("_locales/")) continue;
    const lines = fs.readFileSync(path.join(rootDir, file), "utf8").split("\n");
    let inFile = 0;
    for (let index = 0; index < lines.length && hits.length < limit && inFile < perFile; index += 1) {
      const match = pattern.exec(lines[index]);
      if (!match) continue;
      inFile += 1;
      const start = Math.max(0, match.index - 50);
      hits.push({ file, line: index + 1, match: match[0], snippet: lines[index].slice(start, match.index + 90).trim() });
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

const REMOTE_CODE = [
  { kind: "eval", pattern: /(?<![\w.$])eval\s*\(/ },
  { kind: "new Function", pattern: /new\s+Function\s*\(/ },
  { kind: "remote <script>", pattern: /<script[^>]+src\s*=\s*["']https?:\/\//i },
  { kind: "remote import()", pattern: /\bimport\s*\(\s*["'`]https?:\/\//i },
  { kind: "remote importScripts", pattern: /importScripts\s*\(\s*["'`]https?:\/\//i },
  { kind: "executeScript with a code string", pattern: /executeScript\s*\([^)]*\bcode\s*:/ },
];

const ANALYTICS = /google-analytics\.com|googletagmanager\.com|\bgtag\s*\(|sentry\.io|@sentry\/|mixpanel|amplitude\.com|posthog|segment\.(?:io|com)|hotjar|clarity\.ms|plausible\.io|umami/i;
const PAYMENTS = /stripe\.com|js\.stripe|paddle\.com|lemonsqueezy|paypal\.com|checkout|in-app purchase|\bsubscri(?:be|ption)\b|membership|\bpaywall\b|会员|付费|订阅/i;
const SENSITIVE_APIS = [
  ["cookies", /\bchrome\??\.cookies\b/], ["history", /\bchrome\??\.history\b/], ["bookmarks", /\bchrome\??\.bookmarks\b/],
  ["webRequest", /\bchrome\??\.webRequest\b/], ["debugger", /\bchrome\??\.debugger\b/], ["proxy", /\bchrome\??\.proxy\b/],
  ["nativeMessaging", /connectNative|sendNativeMessage/], ["geolocation", /navigator\.geolocation/],
  ["clipboard read", /navigator\.clipboard\.read|document\.execCommand\(\s*["']paste/],
];
// Origins that appear in code but are never contacted.
const NOT_NETWORK = /^https?:\/\/(?:www\.w3\.org|schemas?\.|json-schema\.org|example\.(?:com|org)|localhost|127\.0\.0\.1|developer\.chrome\.com|developer\.mozilla\.org|github\.com\/[^/]+\/[^/]+\/(?:issues|blob))/i;

/** Everything the code can prove about the listing. */
export function listingFacts(rootDir, manifest, files) {
  const permissions = [
    ...(manifest.permissions || []).map((name) => ({ name, optional: false })),
    ...(manifest.optional_permissions || []).map((name) => ({ name, optional: true })),
  ].filter((item) => !/[:/*<]/.test(item.name)); // MV2 hosts in permissions are handled below
  const hostPatterns = [
    ...(manifest.host_permissions || []).map((pattern) => ({ pattern, source: "host_permissions" })),
    ...(manifest.optional_host_permissions || []).map((pattern) => ({ pattern, source: "optional_host_permissions" })),
    ...(manifest.permissions || []).filter((name) => /[:/*<]/.test(name)).map((pattern) => ({ pattern, source: "permissions" })),
    ...[...new Set((manifest.content_scripts || []).flatMap((script) => script.matches || []))].map((pattern) => ({ pattern, source: "content_scripts" })),
  ].map((host) => ({ ...host, broad: BROAD_HOSTS.test(host.pattern) }));

  const permissionFacts = permissions.map(({ name, optional }) => {
    const usage = findPermissionUsage(rootDir, files, name);
    const hosts = name === "host" ? hostPatterns.map((host) => host.pattern) : [];
    return { name, optional, usage, draft: draftJustification(name, usage, hosts), unused: !usage.length && !NO_API_USAGE.has(name) };
  });

  const endpoints = findEndpoints(rootDir, files);
  const info = localeInfo(manifest, folderReader(rootDir));

  const iconSizes = Object.keys(manifest.icons || {}).map(Number).sort((a, b) => a - b);
  const defaultEntry = info.locales.find((entry) => entry.isDefault) || info.locales[0];
  return {
    name: defaultEntry?.name || manifest.name,
    description: defaultEntry?.description || manifest.description || "",
    version: manifest.version,
    manifestVersion: manifest.manifest_version,
    homepage: manifest.homepage_url || null,
    defaultLocale: info.defaultLocale,
    locales: info.locales.map(({ locale, isDefault, name, description }) => ({ locale, isDefault, name, summary: description })),
    localeProblems: info.problems,
    permissions: permissionFacts,
    hosts: hostPatterns,
    remoteCode: REMOTE_CODE.flatMap(({ kind, pattern }) => scan(rootDir, files, pattern, { limit: 4 }).map((hit) => ({ kind, ...hit }))),
    endpoints,
    signIn: usesSignIn(rootDir, files, manifest),
    analytics: scan(rootDir, files, ANALYTICS, { limit: 6 }),
    payments: scan(rootDir, files, PAYMENTS, { limit: 6 }),
    sensitiveApis: SENSITIVE_APIS.map(([name, pattern]) => ({ name, hits: scan(rootDir, files, pattern, { limit: 3 }) })).filter((item) => item.hits.length),
    icons: { sizes: iconSizes, missing: [16, 32, 48, 128].filter((size) => !iconSizes.includes(size)) },
    oauth2: Boolean(manifest.oauth2),
    externallyConnectable: manifest.externally_connectable || null,
  };
}

/** Server origins written in the code, most mentioned first. */
function findEndpoints(rootDir, files) {
  const found = new Map();
  for (const file of files) {
    if (!CODE.test(file) || file.startsWith("_locales/")) continue;
    const lines = fs.readFileSync(path.join(rootDir, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?/gi)) {
        const origin = match[0].toLowerCase();
        if (NOT_NETWORK.test(origin) || /chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(origin)) continue;
        if (!found.has(origin)) found.set(origin, { origin, first: `${file}:${index + 1}`, count: 0 });
        found.get(origin).count += 1;
      }
    });
  }
  return [...found.values()].sort((a, b) => b.count - a.count).slice(0, 30);
}

// Permissions with no chrome.* namespace to find in code.
const NO_API_USAGE = new Set(["activeTab", "background", "unlimitedStorage", "declarativeNetRequestWithHostAccess", "declarativeNetRequestFeedback"]);

const RTL = new Set(["ar", "he", "fa", "ur"]);

/** Chrome's locale spelling: ko, zh_TW, pt_BR, es_419. */
export function normalizeLocale(locale) {
  const [language, region] = String(locale).trim().replace("-", "_").split("_");
  return region ? `${language.toLowerCase()}_${region.toUpperCase()}` : language.toLowerCase();
}

export const isRtl = (locale) => RTL.has(normalizeLocale(locale).split("_")[0]);

/** The language of a package without _locales, from its name and description. */
export function guessLanguage(text) {
  if (/[぀-ヿ]/.test(text)) return "ja";
  if (/[가-힯]/.test(text)) return "ko";
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[一-鿿]/.test(text)) return "zh_CN";
  return "en";
}

/**
 * Listing languages: every _locales folder (default first); languages the user
 * wants to list in (`extra`), which need _locales/<locale> in the package before
 * the dashboard shows their page; and, if asked, a reading copy in the user's
 * own language.
 */
export function listingLanguages(facts, { readerLocale, extra = [] } = {}) {
  const localized = facts.locales.length > 0;
  const languages = localized
    ? facts.locales.map((entry) => ({ locale: entry.locale, listing: true, isDefault: entry.isDefault, inPackage: true }))
    : [{ locale: guessLanguage(`${facts.name} ${facts.description || ""}`), listing: true, isDefault: true, inPackage: true }];
  for (const wanted of extra.map(normalizeLocale)) {
    if (!languages.some((entry) => entry.locale === wanted)) {
      languages.push({ locale: wanted, listing: true, isDefault: false, inPackage: false });
    }
  }
  const base = (locale) => locale.split(/[_-]/)[0].toLowerCase();
  if (readerLocale && !languages.some((entry) => base(entry.locale) === base(readerLocale))) {
    languages.push({ locale: readerLocale, listing: false, isDefault: false, inPackage: false });
  }
  for (const entry of languages) entry.rtl = isRtl(entry.locale);
  return languages;
}

/** Languages the user wants to list in that the package can't show yet. */
export const missingFromPackage = (languages) => languages.filter((entry) => entry.listing && !entry.inPackage);

const pasteBlock = (hint) => ["```text", `TODO: ${hint}`, "```"].join("\n");

/** A fill-text.md skeleton in dashboard order. Every TODO must be replaced before `listing --check` passes. */
export function fillTextSkeleton(facts, language, { zipName }) {
  const entry = facts.locales.find((item) => item.locale === language.locale);
  const lines = [];
  const field = (title, hint, note = "") => {
    lines.push(`### ${title}`, "");
    if (note) lines.push(note, "");
    lines.push(pasteBlock(hint), "");
  };
  lines.push(
    `# ${facts.name} — dashboard text (${language.locale}${language.listing ? "" : ", reading copy — not a listing language"})`,
    "",
    "Paste each block into the dashboard field of the same name, top to bottom. Upload files are in `upload-files/`.",
    "Text inside the blocks is plain text: no Markdown, no bullets or bold — the dashboard shows it as typed.",
    "",
  );
  if (language.listing && !language.inPackage) {
    lines.push(facts.locales.length
      ? `> **The package has no \`_locales/${language.locale}/messages.json\` yet.** The dashboard shows a ${language.locale} page only after a package containing it is uploaded: add the locale (at least the name and description messages), then upload. Until then this text has nowhere to go.`
      : `> **The package isn't localized**, so the dashboard has a single language page. To list in ${language.locale} too, add \`_locales/\` with \`default_locale\` to the package.`, "");
  }
  if (language.rtl) {
    lines.push(`> ${language.locale} is written right to left: type it as is in the paste blocks, and give the privacy page and promo tiles \`<html lang="${language.locale.replace("_", "-")}" dir="rtl">\`.`, "");
  }
  lines.push(
    "## 1. Store listing (`edit/listing`)",
    "",
  );
  field("Item name", "the name as in the package", entry ? `From \`_locales/${entry.locale}/messages.json\`: ${entry.name}` : "");
  field("Summary", `one sentence, verb first, at most ${DESCRIPTION_MAX} characters`, entry ? `From the package (the manifest description): ${entry.summary}` : "");
  field("Detailed description", "problem it solves; then one feature per line; then who it is for. 300–1000 characters, no superlatives");
  field("Category", "one Chrome Web Store category");
  lines.push("### Files to upload", "", "- Store icon: `upload-files/store-icon-128.png`", "- Screenshots: `upload-files/screenshots/01…05`", "- Small promo tile: `upload-files/promo-small-440x280.png`", "- Marquee (optional): `upload-files/promo-marquee-1400x560.png`", `- Package: \`upload-files/${zipName}\``, "");
  field("Official / homepage / support URL", "public URLs, open without signing in", facts.homepage ? `homepage_url in the manifest: ${facts.homepage}` : "");
  field("Mature content", "No (or Yes, with why)");
  lines.push("## 2. Privacy practices (`edit/privacy`)", "");
  field("Single purpose", "one narrow, easy-to-understand sentence covering everything the extension does");
  for (const permission of facts.permissions) {
    const evidence = permission.usage.length
      ? `Used at ${permission.usage.slice(0, 3).map((hit) => `\`${hit.file}:${hit.line}\``).join(", ")}. Draft from the code: ${permission.draft}`
      : permission.unused ? "**No use found in the packaged code — remove it from the manifest, or explain where it is used.**" : `Draft: ${permission.draft}`;
    field(`Permission: ${permission.name}${permission.optional ? " (optional)" : ""}`, "what it is used for, what user action triggers it, what it does not do", evidence);
  }
  if (facts.hosts.length) {
    // the dashboard has one justification box for all host access
    const listed = facts.hosts.map((host) => `\`${host.pattern}\` (${host.source})${host.broad ? " — **broad: triggers in-depth review; say why a narrower list or activeTab is not enough**" : ""}`);
    field("Host permissions", "one justification covering every site below: why each is needed, what runs there", `Sites: ${listed.join("; ")}`);
  }
  field("Remote code", "No (or Yes, with exactly what and why)", facts.remoteCode.length
    ? `**Possible remote code found:** ${facts.remoteCode.map((hit) => `${hit.kind} at \`${hit.file}:${hit.line}\``).join("; ")}. Manifest V3 forbids executing remote code.`
    : "No eval, new Function, remote script, remote import or code-string executeScript was found in the package.");
  field("Data use: what is collected", "for each dashboard data type: Yes/No and one sentence (collected? why? where does it go?)", facts.endpoints.length ? `Servers the code talks to: ${facts.endpoints.slice(0, 8).map((item) => item.origin).join(", ")}` : "No server addresses found in the code.");
  field("Limited Use certification", "the three statements, true for this extension");
  field("Privacy policy URL", "a public URL; upload-files/privacy-page/index.html can be published");
  lines.push("## 3. Distribution (`edit/distribution`)", "");
  field("Visibility and regions", "Public / Unlisted / Private, and regions");
  field("In-app purchases", "Yes or No", facts.payments.length ? `Payment or membership code found: ${facts.payments.slice(0, 3).map((hit) => `\`${hit.file}:${hit.line}\``).join(", ")}` : "");
  lines.push("## 4. Test instructions (`edit/test-instructions`)", "");
  field("Test instructions", facts.signIn ? "steps to reach the main feature, and a reviewer account that lasts through review (never the password in this file)" : "steps to reach the main feature", facts.signIn ? "The extension signs in: reviewers need a working account." : "");
  lines.push("## 5. Before submitting", "", "- [ ] Every block above pasted in the dashboard, Save draft, reloaded and read back", "- [ ] Every listing language's page checked (language selector)", "- [ ] Privacy policy URL opens without signing in", "");
  return lines.join("\n");
}

export function readmeText(facts, languages, { zipName }) {
  const main = languages.find((entry) => entry.isDefault) || languages[0];
  return [
    `# ${facts.name} ${facts.version} — store submission`,
    "",
    "- **Text for the dashboard:** open `fill-text.md` (" + main.locale + "), top to bottom.",
    "- **Files to upload:** everything is in `upload-files/` (icon, screenshots, promo tiles, privacy page, `" + zipName + "`).",
    `- **Other languages:** \`language-versions/<locale>/\` — ${languages.map((entry) => `\`${entry.locale}\`${entry.listing ? "" : " (reading copy)"}`).join(", ")}. Each has fill-text.md, full-submission.md and privacy-policy.md.`,
    "- `working/` holds the facts and drafts; nothing there is uploaded.",
    "",
  ].join("\n");
}

const fenced = /```[a-z]*\n([\s\S]*?)```/g;

/** Problems in a finished submission folder; an empty list means ready to paste. */
export function checkListingFolder(dir, facts, languages) {
  const problems = [];
  const need = (relative) => {
    if (!fs.existsSync(path.join(dir, relative))) problems.push(`missing ${relative}`);
    return fs.existsSync(path.join(dir, relative));
  };
  need("README.md");
  need("fill-text.md");
  const textFiles = ["fill-text.md"];
  for (const language of languages) {
    for (const name of ["fill-text.md", "full-submission.md", "privacy-policy.md"]) {
      const relative = `language-versions/${language.locale}/${name}`;
      if (need(relative)) textFiles.push(relative);
    }
  }
  for (const relative of textFiles) {
    const text = fs.readFileSync(path.join(dir, relative), "utf8");
    if (/\bTODO\b/.test(text)) problems.push(`${relative}: unfinished TODO`);
    if (!relative.endsWith("fill-text.md")) continue;
    for (const permission of facts.permissions) {
      if (!text.includes(`Permission: ${permission.name}`)) problems.push(`${relative}: no field for permission ${permission.name}`);
    }
    if (facts.hosts.length && !text.includes("### Host permissions")) problems.push(`${relative}: no Host permissions field`);
    for (const [, body] of text.matchAll(fenced)) {
      const markdown = body.split("\n").find((line) => /^\s*(?:[-*+]\s|#{1,6}\s|>\s)|\*\*[^*]+\*\*|`[^`]+`/.test(line));
      if (markdown) problems.push(`${relative}: Markdown inside a paste block: "${markdown.trim().slice(0, 50)}"`);
    }
    const summary = /### Summary[\s\S]*?```[a-z]*\n([\s\S]*?)```/.exec(text)?.[1]?.trim();
    if (summary && summary.length > DESCRIPTION_MAX) problems.push(`${relative}: summary is ${summary.length} characters (limit ${DESCRIPTION_MAX})`);
  }
  const upload = path.join(dir, "upload-files");
  if (fs.existsSync(upload)) {
    const files = fs.readdirSync(upload);
    if (!files.includes("store-icon-128.png")) problems.push("missing upload-files/store-icon-128.png");
    if (!files.includes("promo-small-440x280.png")) problems.push("missing upload-files/promo-small-440x280.png");
    if (!fs.existsSync(path.join(upload, "screenshots")) || !fs.readdirSync(path.join(upload, "screenshots")).some((file) => /^(?!00-).+\.(png|jpe?g)$/i.test(file))) {
      problems.push("missing screenshots in upload-files/screenshots/");
    }
    if (!fs.existsSync(path.join(upload, "privacy-page", "index.html"))) problems.push("missing upload-files/privacy-page/index.html");
    if (!files.some((file) => file.endsWith(".zip"))) problems.push("missing the package ZIP in upload-files/");
  } else {
    problems.push("missing upload-files/");
  }
  return problems;
}
