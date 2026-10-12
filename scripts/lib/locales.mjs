// Per-language store listings. Every folder in _locales gives the item a
// language page in the dashboard's Store listing tab (name, summary, detailed
// description, screenshots). The API can neither read nor write those pages,
// so uploading a multi-language package can leave empty language pages behind.
// This module reads the locales, checks the messages behind the manifest's
// name and description, and works out which languages still have to be
// checked in the dashboard.

import fs from "node:fs";
import path from "node:path";

export const NAME_MAX = 75;
export const DESCRIPTION_MAX = 132;
const LISTING_FIELDS = ["name", "short_name", "description"];
const MSG = /^__MSG_([A-Za-z0-9_@]+)__$/;

/** Reader over an extension folder, for localeInfo(). */
export function folderReader(rootDir) {
  return {
    locales() {
      const dir = path.join(rootDir, "_locales");
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort();
    },
    read(relative) {
      const file = path.join(rootDir, relative);
      return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    },
  };
}

/** Reader over a ZIP (readZip result), e.g. the published package. */
export function zipReader(zip) {
  return {
    locales() {
      const names = new Set();
      for (const name of zip.names()) {
        const match = /^_locales\/([^/]+)\/messages\.json$/.exec(name);
        if (match) names.add(match[1]);
      }
      return [...names].sort();
    },
    read(relative) {
      const data = zip.read(relative);
      return data ? data.toString("utf8") : null;
    },
  };
}

function lookup(messages, key) {
  if (!messages) return undefined;
  // message names are case-insensitive in Chrome
  const hit = Object.keys(messages).find((name) => name.toLowerCase() === key.toLowerCase());
  return hit === undefined ? undefined : messages[hit]?.message;
}

/**
 * @returns {{
 *   localized: boolean, defaultLocale: string|null,
 *   locales: {locale: string, isDefault: boolean, name: string, description: string, fallback: string[]}[],
 *   problems: {severity: "error"|"warning", locale?: string, text: string}[]
 * }}
 */
export function localeInfo(manifest, reader) {
  const defaultLocale = manifest?.default_locale || null;
  const names = reader.locales();
  const problems = [];
  const result = { localized: names.length > 0 || Boolean(defaultLocale), defaultLocale, locales: [], problems };
  if (!result.localized) return result;

  if (names.length && !defaultLocale) {
    problems.push({ severity: "error", text: "_locales exists but manifest.json has no default_locale — Chrome refuses to load it" });
  }
  const catalog = {};
  for (const locale of names) {
    const text = reader.read(`_locales/${locale}/messages.json`);
    if (text === null) {
      problems.push({ severity: locale === defaultLocale ? "error" : "warning", locale, text: `_locales/${locale}/ has no messages.json` });
      continue;
    }
    try {
      catalog[locale] = JSON.parse(text.replace(/^﻿/, ""));
    } catch (error) {
      problems.push({ severity: "error", locale, text: `_locales/${locale}/messages.json is not valid JSON (${error.message})` });
    }
  }
  if (defaultLocale && !names.includes(defaultLocale)) {
    problems.push({ severity: "error", locale: defaultLocale, text: `default_locale "${defaultLocale}" has no _locales/${defaultLocale}/messages.json` });
  }

  const keys = {};
  for (const field of LISTING_FIELDS) {
    const key = MSG.exec(String(manifest[field] || ""))?.[1];
    if (key) keys[field] = key;
  }
  for (const locale of names) {
    if (!(locale in catalog)) continue;
    const isDefault = locale === defaultLocale;
    const entry = { locale, isDefault, name: "", description: "", fallback: [] };
    for (const field of LISTING_FIELDS) {
      const key = keys[field];
      let value = key ? lookup(catalog[locale], key) : manifest[field];
      if (key && (value === undefined || value === "")) {
        if (isDefault) {
          problems.push({ severity: "error", locale, text: `${field} uses __MSG_${key}__ but the default locale has no "${key}" message — Chrome refuses to load it` });
        } else if (field !== "short_name") {
          problems.push({ severity: "warning", locale, text: `no "${key}" message, so the ${locale} page falls back to the ${defaultLocale} ${field}` });
          entry.fallback.push(field);
        }
        value = lookup(catalog[defaultLocale], key) || "";
      }
      if (field === "name" || field === "description") entry[field] = String(value || "").trim();
    }
    // Documented limits. The store has accepted longer translations (a 135-character
    // German summary went through in 2026-10), so these warn instead of blocking.
    if (entry.name.length > NAME_MAX) {
      problems.push({ severity: "warning", locale, text: `name is ${entry.name.length} characters; Google's limit is ${NAME_MAX} (may be cut off)` });
    }
    if (entry.description.length > DESCRIPTION_MAX) {
      problems.push({ severity: "warning", locale, text: `summary (manifest description) is ${entry.description.length} characters; Google's limit is ${DESCRIPTION_MAX} (may be cut off)` });
    }
    result.locales.push(entry);
  }
  // default first, then alphabetical
  result.locales.sort((a, b) => (b.isDefault - a.isDefault) || a.locale.localeCompare(b.locale));
  return result;
}

/**
 * Dashboard to-dos for the per-language listing pages.
 *
 * Blocking until every language has been confirmed once (recorded in
 * .chrome-publish.json as `listingLocales` after a publish with
 * --dashboard-ready). Languages the published package didn't have are called
 * out, because their pages are certainly empty.
 *
 * @param {ReturnType<typeof localeInfo>} local
 * @param {ReturnType<typeof localeInfo>|null} store   published package, if known
 * @param {string[]} confirmed
 */
export function listingActions(local, store, confirmed = []) {
  const actions = [];
  if (!local.localized || !local.locales.length) return actions;
  const all = local.locales.map((entry) => entry.locale);
  const storeLocales = store?.localized ? new Set(store.locales.map((entry) => entry.locale)) : null;
  const added = storeLocales ? all.filter((locale) => !storeLocales.has(locale)) : [];
  const unconfirmed = all.filter((locale) => !confirmed.includes(locale) || added.includes(locale));
  if (unconfirmed.length) {
    actions.push({
      blocking: true,
      tab: "listing",
      listing: true,
      added,
      locales: local.locales.filter((entry) => unconfirmed.includes(entry.locale)),
      title:
        `Check the store listing in ${unconfirmed.length === 1 ? "this language" : `these ${unconfirmed.length} languages`}: ${unconfirmed.join(", ")} — ` +
        "name, summary, detailed description, screenshots" +
        (added.length ? ` (new since the published version: ${added.join(", ")} — those pages are empty)` : ""),
    });
  }
  if (store?.localized) {
    const before = Object.fromEntries(store.locales.map((entry) => [entry.locale, entry]));
    const changed = local.locales.filter((entry) => {
      const old = before[entry.locale];
      return old && !unconfirmed.includes(entry.locale) && (old.name !== entry.name || old.description !== entry.description);
    });
    if (changed.length) {
      actions.push({
        blocking: false,
        tab: "listing",
        title: `Name or summary text changed in ${changed.map((entry) => entry.locale).join(", ")} — update those language pages to match`,
      });
    }
  }
  return actions;
}
