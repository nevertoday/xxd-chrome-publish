// A side panel or popup captured alone is a narrow strip. This puts it back in
// a browser: tab strip and address bar on top, the site it works on at the
// left, the side panel at the right (or the popup under its toolbar icon),
// composed to the store's 1280×800.

import { escapeHtml } from "./runtime.mjs";

export const FRAME = { tabStrip: 34, toolbar: 40, panelHeader: 40 };

const palette = (dark) => (dark
  ? { strip: "#1f1f1f", tab: "#2b2b2b", toolbar: "#2b2b2b", omni: "#1f1f1f", text: "#e3e3e3", muted: "#a8a8a8", line: "#3c3c3c", panel: "#2b2b2b", host: "#202020", bar: "#3a3a3a" }
  : { strip: "#e9ebee", tab: "#ffffff", toolbar: "#ffffff", omni: "#f1f3f4", text: "#1f1f1f", muted: "#5f6368", line: "#dadce0", panel: "#ffffff", host: "#ffffff", bar: "#eceef1" });

// Without a host page: an article layout with no fake text.
function mockHost(c) {
  const lines = (widths) => widths.map((width) => `<i style="width:${width}%"></i>`).join("");
  return `<div class="mock"><b></b><b class="s"></b><div class="p">${lines([92, 100, 96, 88, 100, 64])}</div><div class="img"></div><div class="p">${lines([100, 94, 98, 72])}</div></div>
  <style>.mock{max-width:640px;margin:48px auto;padding:0 32px}.mock b{display:block;height:26px;width:70%;background:${c.bar};margin-bottom:12px}
  .mock b.s{width:38%;height:12px;margin-bottom:32px}.mock .p i{display:block;height:10px;background:${c.bar};margin:0 0 14px}
  .mock .img{height:180px;background:${c.bar};margin:28px 0}</style>`;
}

export function frameHtml({ width = 1280, height = 800, mode, dark = false, ext, host, panel, popup }) {
  const c = palette(dark);
  const top = FRAME.tabStrip + FRAME.toolbar;
  const hostWidth = mode === "sidepanel" ? width - panel.width - 1 : width;
  const hostInner = host?.image
    ? `<img src="${host.image}" style="width:100%;height:100%;object-fit:cover;object-position:top left;display:block">`
    : mockHost(c);
  const icon = ext.icon ? `<img src="${ext.icon}" width="16" height="16">` : "";
  const sidepanel = mode === "sidepanel" ? `
    <aside style="position:absolute;top:${top}px;right:0;width:${panel.width}px;bottom:0;background:${c.panel};border-left:1px solid ${c.line}">
      <header style="height:${FRAME.panelHeader}px;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:13px;color:${c.text};border-bottom:1px solid ${c.line};box-sizing:border-box">
        ${icon}<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(ext.name)}</span>
        <span style="color:${c.muted};font-size:15px">✕</span></header>
      <img src="${panel.image}" style="display:block;width:${panel.width}px;height:${height - top - FRAME.panelHeader}px">
    </aside>` : "";
  const popupBox = mode === "popup" ? `
    <div style="position:absolute;top:${top - 4}px;right:12px;width:${popup.width}px;height:${popup.height}px;border-radius:8px;overflow:hidden;
      box-shadow:0 2px 6px rgba(0,0,0,.18),0 10px 28px rgba(0,0,0,.18);background:${c.panel}">
      <img src="${popup.image}" style="display:block;width:${popup.width}px;height:${popup.height}px"></div>` : "";
  const lights = ["#ff5f57", "#febc2e", "#28c840"].map((color) => `<span style="width:12px;height:12px;border-radius:50%;background:${color}"></span>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${c.host};
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  </style></head><body>
    <div style="height:${FRAME.tabStrip}px;background:${c.strip};display:flex;align-items:flex-end;padding-left:76px">
      <div style="height:28px;width:240px;background:${c.tab};border-radius:8px 8px 0 0;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:12px;color:${c.text}">
        <span style="width:14px;height:14px;border-radius:50%;background:${c.bar};flex:none"></span>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(host?.title || "New Tab")}</span></div>
      <div style="position:absolute;left:14px;top:12px;display:flex;gap:8px">${lights}</div>
    </div>
    <div style="height:${FRAME.toolbar}px;background:${c.toolbar};display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid ${c.line}">
      <span style="color:${c.muted};font-size:15px;letter-spacing:10px">←→↻</span>
      <div style="flex:1;height:30px;border-radius:15px;background:${c.omni};display:flex;align-items:center;padding:0 14px;font-size:13px;color:${c.text};white-space:nowrap;overflow:hidden">${escapeHtml(host?.url || "")}</div>
      <span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;${mode !== "page" ? `background:${c.omni}` : ""}">${icon}</span>
    </div>
    <main style="position:absolute;top:${top}px;left:0;width:${hostWidth}px;bottom:0;overflow:hidden;background:${c.host}">${hostInner}</main>
    ${sidepanel}${popupBox}
  </body></html>`;
}
