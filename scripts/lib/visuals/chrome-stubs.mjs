// A plain web page has no chrome.* — this installs stand-ins so extension
// pages render outside an extension. Known APIs return plausible values;
// anything else falls through to a Proxy whose calls resolve to undefined
// (and call a trailing callback) and whose on* members are empty events.
// chrome.i18n reads the real _locales; chrome.storage can be seeded.

function install(cfg) {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) return;
  const event = () => {
    const listeners = new Set();
    return {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      hasListener: (fn) => listeners.has(fn),
      hasListeners: () => listeners.size > 0,
      _fire: (...args) => listeners.forEach((fn) => { try { fn(...args); } catch (error) { console.error(error); } }),
    };
  };
  const done = (args, value) => {
    const callback = [...args].reverse().find((arg) => typeof arg === "function");
    if (callback) setTimeout(() => callback(value), 0);
    return Promise.resolve(value);
  };
  const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

  const onChanged = event();
  const area = (name, seed) => {
    const data = { ...(seed || {}) };
    return {
      get(keys, ...rest) {
        let result = {};
        if (keys == null) result = clone(data);
        else if (typeof keys === "string") { if (keys in data) result[keys] = clone(data[keys]); }
        else if (Array.isArray(keys)) keys.forEach((key) => { if (key in data) result[key] = clone(data[key]); });
        else if (typeof keys === "object") Object.entries(keys).forEach(([key, fallback]) => { result[key] = key in data ? clone(data[key]) : fallback; });
        return done(typeof keys === "function" ? [keys] : rest, result);
      },
      set(items, ...rest) {
        const changes = {};
        Object.entries(items || {}).forEach(([key, value]) => {
          changes[key] = { oldValue: data[key], newValue: clone(value) };
          data[key] = clone(value);
        });
        onChanged._fire(changes, name);
        return done(rest, undefined);
      },
      remove(keys, ...rest) { [].concat(keys).forEach((key) => delete data[key]); return done(rest, undefined); },
      clear(...rest) { Object.keys(data).forEach((key) => delete data[key]); return done(rest, undefined); },
      getBytesInUse(...rest) { return done(rest, 0); },
      setAccessLevel(...rest) { return done(rest, undefined); },
      onChanged: event(),
    };
  };

  const messages = cfg.messages || {};
  const getMessage = (name, substitutions) => {
    const entry = messages[String(name).toLowerCase()];
    if (!entry) return name === "@@ui_locale" ? cfg.locale : "";
    let text = entry.message;
    const list = substitutions == null ? [] : [].concat(substitutions).map(String);
    if (entry.placeholders) {
      Object.entries(entry.placeholders).forEach(([placeholder, def]) => {
        const value = String(def.content || "").replace(/\$(\d)/g, (_, index) => list[index - 1] ?? "");
        text = text.replace(new RegExp(`\\$${placeholder}\\$`, "gi"), value);
      });
    }
    return text.replace(/\$(\d)/g, (_, index) => list[index - 1] ?? "").replace(/\$\$/g, "$");
  };

  const tab = {
    id: 1, index: 0, windowId: 1, active: true, highlighted: true, pinned: false, incognito: false, status: "complete",
    url: cfg.hostUrl ? (/^[a-z]+:/.test(cfg.hostUrl) ? cfg.hostUrl : `https://${cfg.hostUrl}`) : "https://example.com/",
    title: cfg.hostTitle || "Example",
  };
  const known = {
    runtime: {
      id: "abcdefghijklmnopabcdefghijklmnop",
      lastError: undefined,
      getURL: (file) => `${location.origin}/${String(file).replace(/^\//, "")}`,
      getManifest: () => cfg.manifest,
      sendMessage: (...args) => done(args, cfg.runtimeReply),
      connect: () => ({ name: "", postMessage() {}, disconnect() {}, onMessage: event(), onDisconnect: event() }),
      getPlatformInfo: (...args) => done(args, { os: "mac", arch: "arm" }),
      openOptionsPage: (...args) => done(args, undefined),
      setUninstallURL: (...args) => done(args, undefined),
      getContexts: (...args) => done(args, []),
      onMessage: event(), onConnect: event(), onInstalled: event(), onStartup: event(), onMessageExternal: event(), onSuspend: event(),
    },
    storage: {
      local: area("local", cfg.storage?.local), sync: area("sync", cfg.storage?.sync),
      session: area("session", cfg.storage?.session), managed: area("managed", {}), onChanged,
    },
    i18n: {
      getMessage,
      getUILanguage: () => cfg.locale.replace("_", "-"),
      getAcceptLanguages: (...args) => done(args, [cfg.locale.replace("_", "-")]),
      detectLanguage: (text, ...args) => done(args, { isReliable: true, languages: [{ language: cfg.locale.split("_")[0], percentage: 100 }] }),
    },
    tabs: {
      query: (...args) => done(args, [tab]),
      get: (id, ...args) => done(args, tab),
      getCurrent: (...args) => done(args, tab),
      create: (props, ...args) => done(args, { ...tab, id: 2, ...(props || {}) }),
      update: (id, props, ...args) => done(args, { ...tab, ...(props || {}) }),
      sendMessage: (...args) => done(args, cfg.runtimeReply),
      captureVisibleTab: (...args) => done(args, ""),
      onUpdated: event(), onActivated: event(), onRemoved: event(), onCreated: event(),
    },
    windows: {
      getCurrent: (...args) => done(args, { id: 1, focused: true }),
      getLastFocused: (...args) => done(args, { id: 1, focused: true }),
      WINDOW_ID_CURRENT: -2,
      onFocusChanged: event(),
    },
    permissions: {
      contains: (...args) => done(args, true),
      request: (...args) => done(args, true),
      getAll: (...args) => done(args, { permissions: cfg.manifest.permissions || [], origins: cfg.manifest.host_permissions || [] }),
      onAdded: event(), onRemoved: event(),
    },
    identity: {
      getAuthToken: (...args) => done(args, undefined),
      getProfileUserInfo: (...args) => done(args, { email: "", id: "" }),
      launchWebAuthFlow: (...args) => done(args, undefined),
      getRedirectURL: (suffix = "") => `https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/${suffix}`,
    },
  };

  const noop = () => new Proxy(function stub() {}, {
    get(target, prop) {
      if (prop === "then" || typeof prop === "symbol") return undefined;
      if (/^on[A-Z]/.test(prop)) return (target[prop] = target[prop] || event());
      if (/^[A-Z_]+$/.test(prop)) return prop;
      return noop();
    },
    apply(target, self, args) { return done(args, undefined); },
  });
  const wrap = (object) => new Proxy(object, {
    get: (target, prop) => (prop in target ? target[prop] : typeof prop === "symbol" ? undefined : noop()),
  });
  const chrome = new Proxy({}, {
    get(target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (!(prop in target)) target[prop] = known[prop] ? wrap(known[prop]) : noop();
      return target[prop];
    },
    has: () => true,
  });
  Object.defineProperty(window, "chrome", { value: chrome, configurable: true, writable: true });
  window.browser = undefined;
}

export function chromeStubScript({ manifest, messages, locale, storage, hostUrl, hostTitle, runtimeReply }) {
  const cfg = { manifest, messages, locale: locale || manifest.default_locale || "en", storage: storage || {}, hostUrl, hostTitle, runtimeReply };
  return `(${install.toString()})(${JSON.stringify(cfg)});`;
}
