// Browser runtime for screenshots and store images. The package itself stays
// dependency-free: playwright-core (no bundled browsers) is installed on first
// use into ~/.cache/xxd-chrome-publish/browser-runtime and drives the local
// Google Chrome; without Chrome it falls back to Playwright's Chromium.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

export const RUNTIME_DIR = process.env.XXD_CHROME_PUBLISH_RUNTIME
  || path.join(os.homedir(), ".cache", "xxd-chrome-publish", "browser-runtime");
const PLAYWRIGHT_VERSION = "1.63.0";

export function runtimeInstalled() {
  return fs.existsSync(path.join(RUNTIME_DIR, "node_modules", "playwright-core", "package.json"));
}

export function ensureRuntime() {
  if (runtimeInstalled()) return;
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const pkg = path.join(RUNTIME_DIR, "package.json");
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, `${JSON.stringify({ name: "xxd-chrome-publish-browser-runtime", private: true }, null, 2)}\n`);
  process.stderr.write(`  installing playwright-core@${PLAYWRIGHT_VERSION} into ${RUNTIME_DIR} (first use only)\n`);
  const run = spawnSync("npm", ["install", "--no-audit", "--no-fund", `playwright-core@${PLAYWRIGHT_VERSION}`], { cwd: RUNTIME_DIR, stdio: "inherit" });
  if (run.status !== 0) throw new Error("installing playwright-core failed (npm install)");
}

export function loadPlaywright() {
  ensureRuntime();
  return createRequire(path.join(RUNTIME_DIR, "package.json"))("playwright-core");
}

/** A Chrome executable this machine has, or null (used by tests to decide whether to run). */
export function findChrome() {
  const candidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : process.platform === "win32"
      ? [path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe")]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((file) => fs.existsSync(file)) || null;
}

export async function launchBrowser() {
  const { chromium } = loadPlaywright();
  const args = ["--allow-file-access-from-files", "--font-render-hinting=none", "--hide-scrollbars"];
  try {
    return await chromium.launch({ channel: "chrome", headless: true, args });
  } catch (error) {
    try {
      return await chromium.launch({ headless: true, args });
    } catch {
      throw new Error(`no browser: install Google Chrome, or run "npx --prefix ${RUNTIME_DIR} playwright-core install chromium"\n${error.message}`);
    }
  }
}

export function fileToDataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif",
  }[ext] || "application/octet-stream";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
