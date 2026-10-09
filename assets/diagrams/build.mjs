#!/usr/bin/env node
// Generates the README diagrams: node assets/diagrams/build.mjs
// Layout lives here once; wording lives in TEXT per language. Each SVG carries its
// own light/dark palette (prefers-color-scheme) and a background card, so it stays
// legible on GitHub whatever the page theme.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "PingFang TC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK TC", Helvetica, Arial, sans-serif`;

const STYLE = `
.bg{fill:#ffffff;stroke:#d1d9e0}
.ink{fill:#1f2328}.muted{fill:#59636e}
.node{fill:#f6f8fa;stroke:#d1d9e0}
.line{stroke:#818b98;fill:none}.line-fill{fill:#818b98}
.blue-box{fill:#ddf4ff;stroke:#54aeff}.blue{fill:#0969da}.blue-line{stroke:#0969da;fill:none}.blue-fill{fill:#0969da}
.red-box{fill:#ffebe9;stroke:#ff8182}.red{fill:#cf222e}.red-line{stroke:#cf222e;fill:none}.red-fill{fill:#cf222e}
.amber-box{fill:#fff8c5;stroke:#d4a72c}.amber{fill:#9a6700}.amber-line{stroke:#bf8700;fill:none}.amber-fill{fill:#bf8700}
.green-box{fill:#dafbe1;stroke:#4ac26b}.green{fill:#1a7f37}
.lane{fill:#f6f8fa}
.boundary{stroke:#0969da;fill:none}
.num{fill:#1f2328}.num-text{fill:#ffffff}
@media (prefers-color-scheme: dark){
.bg{fill:#0d1117;stroke:#3d444d}
.ink{fill:#e6edf3}.muted{fill:#9198a1}
.node{fill:#151b23;stroke:#3d444d}
.line{stroke:#656c76}.line-fill{fill:#656c76}
.blue-box{fill:#0c2d6b;stroke:#1f6feb}.blue{fill:#4493f8}.blue-line{stroke:#4493f8}.blue-fill{fill:#4493f8}
.red-box{fill:#3c1618;stroke:#da3633}.red{fill:#ff7b72}.red-line{stroke:#f85149}.red-fill{fill:#f85149}
.amber-box{fill:#3a2a07;stroke:#9e6a03}.amber{fill:#e3b341}.amber-line{stroke:#d29922}.amber-fill{fill:#d29922}
.green-box{fill:#0f2d1a;stroke:#238636}.green{fill:#3fb950}
.lane{fill:#151b23}
.boundary{stroke:#4493f8}
.num{fill:#e6edf3}.num-text{fill:#0d1117}
}`;

// ---------- primitives ----------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦✓✗✕]/u;

/** Rough rendered width; good enough to size boxes around labels. */
function measure(text, size) {
  let width = 0;
  for (const ch of String(text)) {
    if (WIDE.test(ch)) width += 1.0;
    else if (ch === " ") width += 0.3;
    else if (/[A-Z]/.test(ch)) width += 0.64;
    else if (/[il.,:;'!|]/.test(ch)) width += 0.28;
    else if (/[mwMW]/.test(ch)) width += 0.85;
    else width += 0.56;
  }
  return width * size;
}

function text(x, y, value, { size = 13, weight = 400, anchor = "start", cls = "ink" } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" class="${cls}">${esc(value)}</text>`;
}

function rect(x, y, w, h, cls, r = 10) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${cls}" stroke-width="1.2"/>`;
}

function arrow(d, color = "line", { dashed = false, width = 1.6 } = {}) {
  const lineCls = color === "line" ? "line" : `${color}-line`;
  return `<path d="${d}" class="${lineCls}" stroke-width="${width}"${dashed ? ' stroke-dasharray="5 4"' : ""} marker-end="url(#a-${color})"/>`;
}

function markers() {
  return ["line", "blue", "red", "amber"]
    .map((color) => {
      const fill = color === "line" ? "line-fill" : `${color}-fill`;
      return `<marker id="a-${color}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="${fill}"/></marker>`;
    })
    .join("");
}

/** A rounded pill with 1-2 centred lines. Returns {svg, w, h}. */
function pill(cx, y, lines, boxCls, textCls, size = 13, minWidth = 0) {
  const w = Math.ceil(Math.max(minWidth, ...lines.map((line) => measure(line, size)) .map((v) => v + 28)));
  const h = lines.length === 1 ? 34 : 50;
  const x = Math.round(cx - w / 2);
  let svg = rect(x, y, w, h, boxCls, 8);
  lines.forEach((line, index) => {
    const ty = lines.length === 1 ? y + 22 : y + 21 + index * 18;
    svg += text(cx, ty, line, { size, anchor: "middle", cls: index === 0 ? textCls : textCls === "ink" ? "muted" : textCls, weight: index === 0 ? 600 : 400 });
  });
  return { svg, x, w, h };
}

function document(width, height, label, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}" font-family='${FONT}'>
<title>${esc(label)}</title>
<style>${STYLE}</style>
<defs>${markers()}</defs>
${rect(1, 1, width - 2, height - 2, "bg", 16)}
${body}
</svg>
`;
}

// ---------- diagram 1: the publish pipeline ----------

function flow(t) {
  const W = 1280, H = 372;
  const nodeW = 150, nodeH = 64, gap = 50, top = 104;
  const xs = [40, 240, 440, 640, 890, 1090];
  const centre = (i) => xs[i] + nodeW / 2;
  const boundaryX = 840;
  let s = "";

  s += text(40, 44, t.title, { size: 20, weight: 700 });
  s += text((40 + 790) / 2, 82, t.local, { size: 13, anchor: "middle", cls: "muted" });
  s += text((890 + 1240) / 2, 82, t.store, { size: 13, anchor: "middle", cls: "muted" });

  // the upload line: everything left of it can stop without touching the store
  s += `<line x1="${boundaryX}" y1="64" x2="${boundaryX}" y2="${H - 18}" class="boundary" stroke-width="1.6" stroke-dasharray="6 5"/>`;
  s += text(boundaryX, 60, t.boundary, { size: 12, weight: 600, anchor: "middle", cls: "blue" });

  t.steps.forEach(([title, sub], i) => {
    const x = xs[i];
    const cls = i >= 4 ? "blue-box" : "node";
    s += rect(x, top, nodeW, nodeH, cls);
    s += `<circle cx="${x + 22}" cy="${top + 22}" r="11" class="num"/>`;
    s += text(x + 22, top + 26.5, i + 1, { size: 12, weight: 700, anchor: "middle", cls: "num-text" });
    s += text(x + 40, top + 27, title, { size: 15, weight: 700 });
    s += text(x + 16, top + 50, sub, { size: 11.5, cls: "muted" });
    if (i < xs.length - 1) {
      const color = i === 3 ? "blue" : "line";
      s += arrow(`M${x + nodeW + 4},${top + nodeH / 2} H${xs[i + 1] - 6}`, color);
    }
  });

  const y1 = 232, y2 = 298;
  const bottom = top + nodeH;
  // 1+2: a failing build or check
  // wide enough that both arrows land on it
  const p12 = pill((centre(0) + centre(1)) / 2, y1, t.stopFail, "red-box", "red", 13, centre(1) - centre(0) + 60);
  s += arrow(`M${centre(0)},${bottom + 4} V${y1 - 5}`, "red", { width: 1.3 });
  s += arrow(`M${centre(1)},${bottom + 4} V${y1 - 5}`, "red", { width: 1.3 });
  s += p12.svg;
  // 3: a file the manifest needs is missing
  const p3 = pill(centre(2), y1, t.stopMissing, "red-box", "red");
  s += arrow(`M${centre(2)},${bottom + 4} V${y1 - 5}`, "red", { width: 1.3 });
  s += p3.svg;
  // 4: new permission (go to the dashboard, then rerun) / a version already in review
  const p4 = pill(centre(3), y1, t.stopPermission, "amber-box", "amber");
  const p4b = pill(centre(3), y2, t.stopReview, "node", "ink");
  s += arrow(`M${centre(3)},${bottom + 4} V${y1 - 5}`, "amber", { width: 1.3 });
  s += `<path d="M${centre(3) - 60},${y1 + p4.h} V${y2}" class="line" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  s += text(centre(3) - 66, (y1 + p4.h + y2) / 2 + 4, t.or, { size: 11, anchor: "end", cls: "muted" });
  s += p4.svg + p4b.svg;
  const loopY = y1 + p4.h / 2;
  s += arrow(`M${p4.x + p4.w + 4},${loopY} H${centre(4)} V${bottom + 6}`, "amber", { dashed: true });
  s += text((boundaryX + centre(4)) / 2, loopY - 9, t.rerun, { size: 12, anchor: "middle", cls: "amber" });
  // 6: outcome
  const p6 = pill(centre(5), y1, t.inReview, "green-box", "green");
  const p6b = pill(centre(5), y2, t.rejected, "node", "ink");
  s += arrow(`M${centre(5)},${bottom + 4} V${y1 - 5}`, "line", { width: 1.3 });
  s += `<path d="M${centre(5) + 50},${y1 + p6.h} V${y2}" class="line" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  s += text(centre(5) + 56, (y1 + p6.h + y2) / 2 + 4, t.or, { size: 11, cls: "muted" });
  s += p6.svg + p6b.svg;

  return document(W, H, t.aria, s);
}

// ---------- diagram 2: before vs now ----------

function beforeAfter(t) {
  const W = 1200, H = 336;
  const nodeH = 48, gap = 46, startX = 150;
  const lanes = [
    { label: t.before, y: 96, nodes: t.beforeNodes, note: t.beforeNote, end: t.beforeEnd, endCls: "red" },
    { label: t.now, y: 222, nodes: t.nowNodes, note: t.nowNote, end: t.nowEnd, endCls: "green" },
  ];
  const kinds = { plain: ["node", "ink"], upload: ["blue-box", "blue"], fail: ["red-box", "red"], dash: ["amber-box", "amber"], ok: ["green-box", "green"] };
  let s = text(40, 44, t.title, { size: 20, weight: 700 });

  // legend: the two encodings that repeat across lanes
  let lx = W - 40;
  for (const [cls, label] of [["blue-box", t.legendUpload], ["amber-box", t.legendDashboard]]) {
    const w = measure(label, 12);
    lx -= w;
    s += text(lx, 44, label, { size: 12, cls: "muted" });
    lx -= 22;
    s += rect(lx, 33, 14, 14, cls, 3);
    lx -= 22;
  }

  for (const lane of lanes) {
    s += rect(24, lane.y - 22, W - 48, nodeH + 58, "lane", 12);
    s += text(56, lane.y + nodeH / 2 + 6, lane.label, { size: 16, weight: 700, anchor: "middle" });
    let x = startX;
    lane.nodes.forEach(([label, kind], index) => {
      const [box, ink] = kinds[kind];
      const w = Math.ceil(measure(label, 14) + 32);
      s += rect(x, lane.y, w, nodeH, box);
      s += text(x + w / 2, lane.y + 29, label, { size: 14, weight: 600, anchor: "middle", cls: ink === "ink" ? "ink" : ink });
      if (lane.note && lane.note.index === index) {
        s += text(x + w / 2, lane.y + nodeH + 20, lane.note.text, { size: 11.5, anchor: "middle", cls: lane.note.cls });
      }
      if (index < lane.nodes.length - 1) s += arrow(`M${x + w + 4},${lane.y + nodeH / 2} H${x + w + gap - 6}`);
      x += w + gap;
    });
    s += text(x - gap + 18, lane.y + nodeH / 2 + 5, lane.end, { size: 13, weight: 600, cls: lane.endCls });
  }
  return document(W, H, t.aria, s);
}

// ---------- diagram 3: who does what ----------

function roles(t) {
  const W = 1200, H = 360;
  let s = text(40, 44, t.title, { size: 20, weight: 700 });

  const tool = { x: 40, y: 84, w: 250, h: 64 };
  const you = { x: 40, y: 236, w: 250, h: 64 };
  const api = { x: 410, y: 84, w: 380, h: 64 };
  const dash = { x: 410, y: 222, w: 380, h: 92 };
  const store = { x: 910, y: 84, w: 250, h: 230 };

  s += rect(tool.x, tool.y, tool.w, tool.h, "blue-box");
  s += text(tool.x + 18, tool.y + 28, "xxd-chrome-publish", { size: 15, weight: 700, cls: "blue" });
  s += text(tool.x + 18, tool.y + 49, t.toolSub, { size: 12, cls: "muted" });

  s += rect(you.x, you.y, you.w, you.h, "amber-box");
  s += text(you.x + 18, you.y + 28, t.you, { size: 15, weight: 700, cls: "amber" });
  s += text(you.x + 18, you.y + 49, t.youSub, { size: 12, cls: "muted" });

  s += rect(api.x, api.y, api.w, api.h, "node");
  s += text(api.x + 18, api.y + 28, t.apiTitle, { size: 15, weight: 700 });
  s += text(api.x + 18, api.y + 49, t.apiSub, { size: 12, cls: "muted" });

  s += rect(dash.x, dash.y, dash.w, dash.h, "node");
  s += text(dash.x + 18, dash.y + 28, t.dashTitle, { size: 15, weight: 700 });
  t.dashLines.forEach((line, i) => (s += text(dash.x + 18, dash.y + 52 + i * 20, line, { size: 12, cls: "muted" })));

  s += rect(store.x, store.y, store.w, store.h, "green-box");
  s += text(store.x + store.w / 2, store.y + store.h / 2 - 4, t.storeTitle, { size: 16, weight: 700, anchor: "middle", cls: "green" });
  s += text(store.x + store.w / 2, store.y + store.h / 2 + 20, t.storeSub, { size: 12, anchor: "middle", cls: "muted" });

  // automatic path
  const ay = api.y + api.h / 2;
  s += arrow(`M${tool.x + tool.w + 4},${ay} H${api.x - 6}`, "blue", { width: 2 });
  s += text((tool.x + tool.w + api.x) / 2, ay - 10, t.auto, { size: 12, weight: 600, anchor: "middle", cls: "blue" });
  s += arrow(`M${api.x + api.w + 4},${ay} H${store.x - 6}`, "blue", { width: 2 });

  // manual path
  const my = you.y + 40;
  s += arrow(`M${you.x + you.w + 4},${my} H${dash.x - 6}`, "amber", { width: 2 });
  s += text((you.x + you.w + dash.x) / 2, my - 10, t.manual, { size: 12, weight: 600, anchor: "middle", cls: "amber" });
  s += arrow(`M${dash.x + dash.w + 4},${dash.y + dash.h / 2} H${store.x - 6}`, "amber", { width: 2 });

  // the tool hands you the to-do list
  const hx = tool.x + 70;
  s += arrow(`M${hx},${tool.y + tool.h + 4} V${you.y - 6}`, "line", { dashed: true });
  s += text(hx + 12, (tool.y + tool.h + you.y) / 2 + 4, t.handoff, { size: 12, cls: "muted" });

  // and it cannot drive the dashboard itself
  const bx = 350, by = dash.y + 16;
  s += `<path d="M${tool.x + tool.w + 4},${tool.y + tool.h - 12} H${bx} V${by} H${dash.x - 6}" class="red-line" stroke-width="1.4" stroke-dasharray="4 4"/>`;
  const cy = (tool.y + tool.h + by) / 2;
  s += `<circle cx="${bx}" cy="${cy}" r="10" class="bg"/><path d="M${bx - 5},${cy - 5} L${bx + 5},${cy + 5} M${bx + 5},${cy - 5} L${bx - 5},${cy + 5}" class="red-line" stroke-width="2"/>`;
  s += text(bx + 18, cy + 4, t.blocked, { size: 12, cls: "red" });

  return document(W, H, t.aria, s);
}

// ---------- wording ----------

const TEXT = {
  "zh-Hans": {
    flow: {
      title: "一次发布，经过这 6 步",
      local: "在你的电脑上：任何一步出问题就停下，什么都不上传",
      store: "商店",
      boundary: "上传线",
      steps: [["构建", "跑 build 脚本"], ["检查", "跑 check 脚本"], ["打包", "找齐所有文件"], ["对比", "和线上版本比"], ["上传", "传到商店"], ["提交", "进入审核"]],
      stopFail: ["失败", "→ 停下，不上传"],
      stopMissing: ["缺文件", "→ 停下"],
      stopPermission: ["有新权限", "→ 先去后台写说明"],
      stopReview: ["有版本在审核", "→ 先等"],
      rerun: "填好后再跑", or: "或",
      inReview: ["审核中", "PENDING_REVIEW"],
      rejected: ["被拒？补完后台", "→ submit 重新提交"],
      aria: "发布流程：构建、检查、打包、和线上版本对比都在上传之前，任何一步出问题都会停下，不上传；之后才上传并提交审核。",
    },
    beforeAfter: {
      title: "补资料这一步，从上传之后挪到了上传之前",
      before: "以前", now: "现在",
      beforeNodes: [["打包", "plain"], ["上传 ✓", "upload"], ["提交 ✗", "fail"], ["去后台查原因、补资料", "dash"], ["再提交", "plain"]],
      beforeNote: { index: 2, text: "does not meet the requirements", cls: "red" },
      beforeEnd: "多绕一圈",
      nowNodes: [["预检：发现新权限", "plain"], ["去后台写说明", "dash"], ["上传", "upload"], ["提交 ✓", "ok"]],
      nowNote: { index: 0, text: "还没上传任何东西", cls: "muted" },
      nowEnd: "一次通过",
      legendUpload: "上传", legendDashboard: "去后台（手动）",
      aria: "以前：上传后提交被拒，再去后台补资料。现在：预检先发现新权限，去后台写好说明后再上传，一次通过。",
    },
    roles: {
      title: "工具自动做的，和只能你在后台做的",
      toolSub: "命令行 / AI 技能",
      you: "你", youSub: "在浏览器里点",
      apiTitle: "Chrome Web Store API", apiSub: "上传 · 提交 · 查状态 · 撤回 · 灰度",
      dashTitle: "开发者后台（网页）", dashLines: ["首次上架 · 描述 · 截图", "隐私页：权限说明、数据用途"],
      storeTitle: "Chrome 网上应用店", storeSub: "你的插件",
      auto: "自动", manual: "手动",
      handoff: "告诉你填什么 + 链接",
      blocked: "浏览器插件不能操作商店页面",
      aria: "工具通过 API 自动上传和提交；首次上架、商店描述和隐私页只能由你在开发者后台手动完成，工具会告诉你填什么。",
    },
  },
  "zh-Hant": {
    flow: {
      title: "一次發布，經過這 6 步",
      local: "在你的電腦上：任何一步出問題就停下，什麼都不上傳",
      store: "商店",
      boundary: "上傳線",
      steps: [["建置", "跑 build 腳本"], ["檢查", "跑 check 腳本"], ["打包", "找齊所有檔案"], ["比對", "和線上版本比"], ["上傳", "傳到商店"], ["送審", "進入審核"]],
      stopFail: ["失敗", "→ 停下，不上傳"],
      stopMissing: ["缺檔案", "→ 停下"],
      stopPermission: ["有新權限", "→ 先到資訊主頁寫說明"],
      stopReview: ["有版本在審核", "→ 先等"],
      rerun: "填好後再跑", or: "或",
      inReview: ["審核中", "PENDING_REVIEW"],
      rejected: ["被退回？補完資訊主頁", "→ submit 重新送審"],
      aria: "發布流程：建置、檢查、打包、和線上版本比對都在上傳之前，任何一步出問題都會停下，不上傳；之後才上傳並送審。",
    },
    beforeAfter: {
      title: "補資料這一步，從上傳之後挪到了上傳之前",
      before: "以前", now: "現在",
      beforeNodes: [["打包", "plain"], ["上傳 ✓", "upload"], ["送審 ✗", "fail"], ["到資訊主頁查原因、補資料", "dash"], ["再送審", "plain"]],
      beforeNote: { index: 2, text: "does not meet the requirements", cls: "red" },
      beforeEnd: "多繞一圈",
      nowNodes: [["預檢：發現新權限", "plain"], ["到資訊主頁寫說明", "dash"], ["上傳", "upload"], ["送審 ✓", "ok"]],
      nowNote: { index: 0, text: "還沒上傳任何東西", cls: "muted" },
      nowEnd: "一次通過",
      legendUpload: "上傳", legendDashboard: "到資訊主頁（手動）",
      aria: "以前：上傳後送審被退回，再到資訊主頁補資料。現在：預檢先發現新權限，寫好說明後再上傳，一次通過。",
    },
    roles: {
      title: "工具自動做的，和只能你在資訊主頁做的",
      toolSub: "命令列 / AI 技能",
      you: "你", youSub: "在瀏覽器裡點",
      apiTitle: "Chrome Web Store API", apiSub: "上傳 · 送審 · 查狀態 · 撤回 · 分批發布",
      dashTitle: "開發人員資訊主頁（網頁）", dashLines: ["首次上架 · 說明 · 螢幕截圖", "隱私權：權限說明、資料用途"],
      storeTitle: "Chrome 線上應用程式商店", storeSub: "你的擴充功能",
      auto: "自動", manual: "手動",
      handoff: "告訴你填什麼 + 連結",
      blocked: "瀏覽器擴充功能不能操作商店頁面",
      aria: "工具透過 API 自動上傳和送審；首次上架、商店說明和隱私權分頁只能由你在資訊主頁手動完成，工具會告訴你填什麼。",
    },
  },
  en: {
    flow: {
      title: "One publish, six steps",
      local: "On your computer — if any step fails, it stops and nothing is uploaded",
      store: "Store",
      boundary: "upload line",
      steps: [["Build", "your build script"], ["Check", "your check script"], ["Package", "find every file"], ["Compare", "with the live version"], ["Upload", "to the store"], ["Submit", "for review"]],
      stopFail: ["Fails", "→ stop, upload nothing"],
      stopMissing: ["File missing", "→ stop"],
      stopPermission: ["New permission", "→ explain it first"],
      stopReview: ["Already in review", "→ wait"],
      rerun: "rerun when done", or: "or",
      inReview: ["In review", "PENDING_REVIEW"],
      rejected: ["Rejected? Fix the", "dashboard → submit"],
      aria: "Publish flow: build, check, package and compare with the live version all happen before the upload; any problem stops there and nothing is uploaded. Then it uploads and submits for review.",
    },
    beforeAfter: {
      title: "The dashboard step moves from after the upload to before it",
      before: "Before", now: "Now",
      beforeNodes: [["Package", "plain"], ["Upload ✓", "upload"], ["Submit ✗", "fail"], ["Find out why, fill dashboard", "dash"], ["Submit again", "plain"]],
      beforeNote: { index: 2, text: "does not meet the requirements", cls: "red" },
      beforeEnd: "an extra round",
      nowNodes: [["Preflight: new permission", "plain"], ["Explain it in dashboard", "dash"], ["Upload", "upload"], ["Submit ✓", "ok"]],
      nowNote: { index: 0, text: "nothing uploaded yet", cls: "muted" },
      nowEnd: "first time",
      legendUpload: "upload", legendDashboard: "dashboard (by hand)",
      aria: "Before: upload, submit is rejected, then fix the dashboard. Now: preflight spots the new permission, you explain it in the dashboard, then upload and submit once.",
    },
    roles: {
      title: "What the tool does for you, and what only you can do",
      toolSub: "CLI / AI skill",
      you: "You", youSub: "click in the browser",
      apiTitle: "Chrome Web Store API", apiSub: "upload · submit · status · cancel · rollout",
      dashTitle: "Developer Dashboard (web)", dashLines: ["first listing · description · screenshots", "privacy tab: permission notes, data use"],
      storeTitle: "Chrome Web Store", storeSub: "your extension",
      auto: "automatic", manual: "by hand",
      handoff: "what to fill + link",
      blocked: "extensions can't control store pages",
      aria: "The tool uploads and submits automatically through the API; the first listing, store text and privacy tab can only be done by you in the dashboard, and the tool tells you what to fill in.",
    },
  },
};

for (const [lang, t] of Object.entries(TEXT)) {
  fs.writeFileSync(path.join(OUT, `flow.${lang}.svg`), flow(t.flow));
  fs.writeFileSync(path.join(OUT, `before-after.${lang}.svg`), beforeAfter(t.beforeAfter));
  fs.writeFileSync(path.join(OUT, `roles.${lang}.svg`), roles(t.roles));
}
console.log(`wrote ${Object.keys(TEXT).length * 3} diagrams to ${path.relative(process.cwd(), OUT) || "."}`);
