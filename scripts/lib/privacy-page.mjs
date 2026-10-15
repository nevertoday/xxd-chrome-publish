// Publish upload-files/privacy-page/index.html as a public GitHub Pages site —
// one public repository per extension (<slug>-privacy), served from main / (root)
// at https://<owner>.github.io/<slug>-privacy/ — then write that URL into every
// fill-text.md. This is visible to everyone: run it when the user said to publish.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** A repository name from the English listing name: "XXD Cover Collage - WeChat…" → "xxd-cover-collage-privacy". */
export function privacyRepoName(name) {
  const head = String(name || "").split(/\s+[-–—·|:]\s+/)[0];
  const slug = head.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return slug ? `${slug}-privacy` : "";
}

/** Put the URL into the "Privacy policy URL" paste block, whatever it held. */
export function setPrivacyUrl(text, url) {
  return text.replace(/(### Privacy policy URL\n[\s\S]*?```[a-z]*\n)[\s\S]*?(\n```)/, `$1${url}$2`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw new Error(`${command} not found — install it first (${result.error.code})`);
  return { ok: result.status === 0, out: (result.stdout || "").trim(), err: (result.stderr || "").trim() };
}

/**
 * @returns {Promise<{url: string, repo: string, created: boolean, pushed: boolean, live: boolean}>}
 */
export async function publishPrivacyPage({ page, owner, repo, title, log = () => {}, waitSeconds = 180 }) {
  if (!fs.existsSync(page)) throw new Error(`${page} doesn't exist — write the privacy page first`);
  if (!run("gh", ["auth", "status"]).ok) throw new Error("gh isn't signed in: run `gh auth login`");
  const login = owner || run("gh", ["api", "user", "-q", ".login"]).out;
  if (!login) throw new Error("couldn't tell the GitHub account; pass --owner");
  const full = `${login}/${repo}`;

  let created = false;
  if (!run("gh", ["repo", "view", full, "--json", "name"]).ok) {
    const made = run("gh", ["repo", "create", full, "--public", "--description", `Privacy policy for ${title}`]);
    if (!made.ok) throw new Error(`gh repo create ${full} failed: ${made.err}`);
    created = true;
    log("repo", `created https://github.com/${full} (public)`);
  } else {
    log("repo", `https://github.com/${full} (exists)`);
  }

  // clone (empty repos clone fine), replace index.html, push only if it changed
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "xcp-privacy-"));
  try {
    const clone = run("gh", ["repo", "clone", full, work]);
    if (!clone.ok) throw new Error(`gh repo clone ${full} failed: ${clone.err}`);
    const git = (...args) => run("git", ["-C", work, ...args]);
    if (!git("rev-parse", "--verify", "HEAD").ok) git("checkout", "-b", "main");
    fs.copyFileSync(page, path.join(work, "index.html"));
    git("add", "index.html");
    let pushed = false;
    if (!git("diff", "--cached", "--quiet").ok) {
      const commit = git("commit", "-m", created ? "Privacy policy" : "Update privacy policy");
      if (!commit.ok) throw new Error(`git commit failed: ${commit.err}`);
      const push = git("push", "origin", "HEAD:main");
      if (!push.ok) throw new Error(`git push failed: ${push.err}`);
      pushed = true;
      log("page", "index.html pushed");
    } else {
      log("page", "index.html unchanged");
    }

    if (!run("gh", ["api", `repos/${full}/pages`]).ok) {
      const enable = run("gh", ["api", "-X", "POST", `repos/${full}/pages`, "-f", "source[branch]=main", "-f", "source[path]=/"]);
      if (!enable.ok) throw new Error(`enabling GitHub Pages failed: ${enable.err}`);
      log("pages", "enabled from main / (root)");
    }
    const url = run("gh", ["api", `repos/${full}/pages`, "-q", ".html_url"]).out || `https://${login}.github.io/${repo}/`;

    // the first build takes a minute or two; wait until the public sees this version
    const expected = fs.readFileSync(page, "utf8").replace(/\s+/g, " ").slice(0, 200);
    let live = false;
    for (let waited = 0; waited <= waitSeconds; waited += 10) {
      try {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (response.ok && (await response.text()).replace(/\s+/g, " ").includes(expected.slice(0, 80))) {
          live = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
    return { url, repo: full, created, pushed, live };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
