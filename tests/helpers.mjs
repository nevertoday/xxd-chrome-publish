// Test helpers: a fake Chrome Web Store and throwaway extension folders.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createZip } from "../scripts/lib/zip.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CLI = path.join(here, "..", "scripts", "xxd-chrome-publish.mjs");
export const PUBLISHER = "pub-0000";
export const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";

export function tempDir(prefix = "xcp-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Write files ({relativePath: string|object}) into dir; objects become JSON. */
export function writeTree(dir, files) {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  return dir;
}

export function baseManifest(overrides = {}) {
  return {
    manifest_version: 3,
    name: "Test Extension",
    version: "1.0.0",
    background: { service_worker: "background.js" },
    permissions: ["storage"],
    ...overrides,
  };
}

/** A CRX3 wrapping a ZIP that contains the given manifest. */
export function makeCrx(manifest, extra = {}) {
  const entries = [{ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest)) }];
  for (const [name, data] of Object.entries(extra)) entries.push({ name, data: Buffer.from(data) });
  const zip = createZip(entries);
  const header = Buffer.from([0x0a, 0x00]); // tiny fake CrxFileHeader proto
  const prefix = Buffer.alloc(12);
  prefix.write("Cr24", 0, "latin1");
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  return Buffer.concat([prefix, header, zip]);
}

/**
 * Fake store. `items[id]` holds { status, crx, publishError, uploadVersionFrom }.
 * Every request is recorded in `requests`.
 */
export async function startMockStore() {
  const items = {};
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, "http://x");
      requests.push({ method: req.method, path: url.pathname, auth: req.headers.authorization, body });
      const send = (status, json) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      const crxMatch = url.pathname.match(/^\/crx\/([a-p]{32})$/);
      if (crxMatch) {
        const crx = items[crxMatch[1]]?.crx;
        if (!crx) return send(404, {});
        res.writeHead(200, { "Content-Type": "application/x-chrome-extension" });
        return res.end(crx);
      }
      const match = url.pathname.match(/^(?:\/upload)?\/v2\/publishers\/([^/]+)\/items\/([a-p]{32}):(\w+)$/);
      if (!match) return send(404, { error: { message: "no route" } });
      const [, publisher, id, action] = match;
      const item = items[id];
      if (!item || publisher !== PUBLISHER) return send(404, { error: { message: "Item not found" } });
      if (req.headers.authorization !== "Bearer test-token") return send(403, { error: { message: "Permission denied" } });
      if (action === "fetchStatus") return send(200, { name: `publishers/${publisher}/items/${id}`, itemId: id, ...item.status });
      if (action === "upload") {
        item.uploaded = body;
        return send(200, { itemId: id, crxVersion: item.uploadVersion || "?", uploadState: "SUCCEEDED" });
      }
      if (action === "publish") {
        if (item.publishError) return send(400, { error: { message: item.publishError } });
        item.publishBody = JSON.parse(body.toString() || "{}");
        return send(200, { itemId: id, state: "PENDING_REVIEW" });
      }
      if (action === "cancelSubmission") {
        delete item.status.submittedItemRevisionStatus;
        return send(200, {});
      }
      return send(404, { error: { message: `unknown action ${action}` } });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    items,
    requests,
    calls: (action) => requests.filter((request) => request.path.endsWith(`:${action}`)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export function published(version, state = "PUBLISHED") {
  return { state, distributionChannels: [{ deployPercentage: 100, crxVersion: version }] };
}

/** Run the CLI against the mock store. Resolves with {code, stdout, stderr}. */
export function runCli(args, { store, cwd, configDir, env = {} } = {}) {
  const config = path.join(configDir || tempDir("xcp-config-"), "config.json");
  if (!fs.existsSync(config)) fs.writeFileSync(config, JSON.stringify({ publisherId: PUBLISHER }));
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      {
        cwd,
        env: {
          ...process.env,
          CWS_API_BASE: store?.base || "http://127.0.0.1:9",
          CWS_CRX_URL_TEMPLATE: `${store?.base || "http://127.0.0.1:9"}/crx/{id}`,
          CWS_ACCESS_TOKEN: "test-token",
          XXD_CHROME_PUBLISH_CONFIG: config,
          CWS_CLIENT_ID: "",
          CWS_REFRESH_TOKEN: "",
          ...env,
        },
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }),
    );
  });
}
