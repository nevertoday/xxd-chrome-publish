// Open one extension page in a browser context with the chrome.* stand-ins,
// seeded storage and (by default) no network beyond the local server.

import { chromeStubScript } from "./chrome-stubs.mjs";
import { loadMessages, readManifest, toBcp47 } from "./pages.mjs";
import { startStaticServer } from "./static-server.mjs";

export async function openExtensionPage(browser, {
  root, pagePath, locale, viewport, colorScheme = "light", storage, localStorage: seedLocal, hostUrl, hostTitle,
  runtimeReply, useChromeStubs = true, deviceScaleFactor = 1, allowNetwork = false,
}) {
  const manifest = readManifest(root);
  const resolvedLocale = locale || manifest.default_locale || "en";
  const server = await startStaticServer(root);
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: toBcp47(resolvedLocale), colorScheme, reducedMotion: "reduce" });
  if (useChromeStubs) {
    await context.addInitScript(chromeStubScript({
      manifest, messages: loadMessages(root, resolvedLocale), locale: resolvedLocale, storage, hostUrl, hostTitle, runtimeReply,
    }));
  }
  if (seedLocal && Object.keys(seedLocal).length) {
    // before the page's own scripts, e.g. a theme setting or a signed-in mirror
    await context.addInitScript((items) => {
      for (const [key, value] of Object.entries(items)) {
        try {
          if (localStorage.getItem(key) === null) localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        } catch {}
      }
    }, seedLocal);
  }
  if (!allowNetwork) {
    // Screenshots never touch real accounts or live APIs, and don't change with live data.
    await context.route("**/*", (route) => {
      const url = route.request().url();
      return url.startsWith(server.origin) || url.startsWith("data:") || url.startsWith("blob:")
        ? route.continue()
        : route.abort("internetdisconnected");
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.origin}/${String(pagePath).replace(/^\//, "")}`, { waitUntil: "load" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 4000 });
  } catch {}
  if (colorScheme === "dark") {
    // Pages themed through data-theme (xxd-ui and others) often default to light rather than the system.
    await page.evaluate(() => {
      const root = document.documentElement;
      if (root.hasAttribute("data-theme")) root.setAttribute("data-theme", "dark");
      if (root.hasAttribute("data-mode")) root.setAttribute("data-mode", "dark");
    });
  }
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return {
    page, context, manifest, locale: resolvedLocale, errors, origin: server.origin,
    close: async () => {
      await context.close();
      await server.close();
    },
  };
}
