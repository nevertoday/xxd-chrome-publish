// Config files, build/check scripts and git facts for an extension project.
//
// Global config  ~/.config/xxd-chrome-publish/config.json  (publisher + auth)
// Project config <extension>/.chrome-publish.json          (extension ID + options)
//   {
//     "extensionId": "abcdefghijklmnopabcdefghijklmnop",
//     "publisherId": "...",            optional, overrides the global one
//     "build": "npm run build" | false, default: the package.json "build" script if any
//     "check": "npm run check" | false, default: the package.json "check" script if any
//     "packageDir": "dist",            package from here after building (default ".")
//     "include": ["assets/extra/**"],  force files into the ZIP
//     "exclude": ["fixtures/**"]       keep files out of the ZIP
//   }

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const TOOL = "xxd-chrome-publish";
export const LOCAL_CONFIG = ".chrome-publish.json";
export const EXTENSION_ID_RE = /^[a-p]{32}$/;

function configHome() {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

export function globalConfigPath() {
  return process.env.XXD_CHROME_PUBLISH_CONFIG || path.join(configHome(), TOOL, "config.json");
}

// Earlier versions of this tool kept the same fields here.
const LEGACY_CONFIG = () => path.join(configHome(), "cx-chrome-publish", "config.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
}

export function loadGlobalConfig() {
  const file = globalConfigPath();
  const source = fs.existsSync(file) ? file : !process.env.XXD_CHROME_PUBLISH_CONFIG && fs.existsSync(LEGACY_CONFIG()) ? LEGACY_CONFIG() : "";
  if (!source) return { path: file, config: {} };
  try {
    const { scope, project, ...config } = readJson(source);
    return { path: file, config, legacy: source !== file ? source : "" };
  } catch (error) {
    throw new Error(`cannot parse ${source}: ${error.message}`);
  }
}

export function saveGlobalConfig(config) {
  writeJson(globalConfigPath(), config, 0o600);
  return globalConfigPath();
}

export function resolveRoot(input) {
  const resolved = path.resolve(input || process.cwd());
  if (!fs.existsSync(resolved)) throw new Error(`path does not exist: ${resolved}`);
  if (fs.statSync(resolved).isFile()) {
    if (path.basename(resolved) !== "manifest.json") throw new Error("a file argument must be manifest.json");
    return path.dirname(resolved);
  }
  return resolved;
}

export function loadLocalConfig(rootDir) {
  const file = path.join(rootDir, LOCAL_CONFIG);
  if (!fs.existsSync(file)) return {};
  try {
    return readJson(file);
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${error.message}`);
  }
}

export function saveLocalConfig(rootDir, config) {
  const file = path.join(rootDir, LOCAL_CONFIG);
  writeJson(file, config);
  return file;
}

export function normalizePublisherId(value) {
  return String(value || "").trim().replace(/^.*devconsole\//, "").replace(/^publishers\//, "").replace(/[/?#].*$/, "");
}

export function normalizeExtensionId(value) {
  const text = String(value || "").trim().toLowerCase();
  // accept a store URL as well as the bare ID
  return text.match(/[a-p]{32}/)?.[0] || text.replace(/^items\//, "");
}

function packageManager(rootDir) {
  if (fs.existsSync(path.join(rootDir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(rootDir, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(rootDir, "bun.lockb")) || fs.existsSync(path.join(rootDir, "bun.lock"))) return "bun";
  return "npm";
}

function packageScripts(rootDir) {
  try {
    return readJson(path.join(rootDir, "package.json")).scripts || {};
  } catch {
    return {};
  }
}

/** The build and check commands to run, or "" when there are none. */
export function projectCommands(rootDir, local) {
  const scripts = packageScripts(rootDir);
  const runner = packageManager(rootDir);
  const pick = (key) => {
    if (local[key] === false) return "";
    if (typeof local[key] === "string") return local[key];
    return scripts[key] ? `${runner} run ${key}` : "";
  };
  return { build: pick("build"), check: pick("check") };
}

export function runCommand(command, cwd, { quiet = false } = {}) {
  const started = Date.now();
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    // build/check output goes to stderr so stdout stays clean for --json
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", 2, 2],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    output: quiet ? `${result.stdout || ""}${result.stderr || ""}` : "",
  };
}

function git(rootDir, args) {
  const result = spawnSync("git", ["-C", rootDir, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const NON_SHIPPING = [
  "**/*.md", "**/.DS_Store", "**/.gitignore", "**/LICENSE*", "**/tests/**", "**/test/**",
  "**/__tests__/**", "**/docs/**", "**/.github/**", "**/*.test.*", "**/*.spec.*", LOCAL_CONFIG,
];

export function gitInfo(rootDir) {
  if (git(rootDir, ["rev-parse", "--is-inside-work-tree"]) !== "true") return null;
  const bump = git(rootDir, ["log", "-1", "--format=%H", "-G", '"version"[[:space:]]*:', "--", "manifest.json"]);
  // Only count commits that could change what ships: docs, tests and repo chores don't.
  const paths = ["--", ".", ...NON_SHIPPING.map((pattern) => `:(exclude,glob)${pattern}`)];
  const since = bump ? Number(git(rootDir, ["rev-list", "--count", `${bump}..HEAD`, ...paths]) || 0) : null;
  const subjects = bump ? (git(rootDir, ["log", "--format=%s", `${bump}..HEAD`, ...paths]) || "").split("\n").filter(Boolean) : [];
  const dirty = (git(rootDir, ["status", "--porcelain", ...paths]) || "").split("\n").filter(Boolean);
  return {
    branch: git(rootDir, ["branch", "--show-current"]) || "",
    commitsSinceVersionBump: since,
    subjects,
    dirty: dirty.length,
    lastCommit: git(rootDir, ["log", "-1", "--format=%cs"]) || "",
  };
}

export function gitCommitManifest(rootDir, files, message) {
  const result = spawnSync("git", ["-C", rootDir, "commit", "-q", "-m", message, "--", ...files], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git commit failed: ${(result.stderr || result.stdout).trim()}`);
  return git(rootDir, ["log", "-1", "--format=%h"]);
}

/** Find every bound extension under a folder (skips dependencies and VCS dirs). */
export function findBoundProjects(rootDir, maxDepth = 5) {
  const found = [];
  const skip = new Set(["node_modules", ".git", "dist", "build", ".worktrees", ".next", "coverage"]);
  (function visit(dir, depth) {
    if (fs.existsSync(path.join(dir, LOCAL_CONFIG)) && fs.existsSync(path.join(dir, "manifest.json"))) {
      found.push(dir);
    }
    if (depth >= maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !skip.has(entry.name) && !entry.name.startsWith(".")) {
        visit(path.join(dir, entry.name), depth + 1);
      }
    }
  })(rootDir, 0);
  return found.sort();
}

export function defaultOutputDir(config) {
  if (config.outputDir) return config.outputDir.replace(/^~(?=$|\/)/, os.homedir());
  const desktop = path.join(os.homedir(), "Desktop");
  return fs.existsSync(desktop) ? desktop : path.join(os.homedir(), TOOL);
}
