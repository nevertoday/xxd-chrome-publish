// The user-facing report. Smaller models summarise away items and blur
// "uploaded" into "published", so the CLI writes the finished report itself —
// conclusion, the three stages, every to-do with the text to paste, and the
// exact next command — and the agent forwards it as is.

const T = {
  zh: {
    begin: "======== REPORT（把这一段原样发给用户）========",
    end: "======== END REPORT ========",
    conclusion: "结论",
    stages: "三个阶段（分开看，不等于“发布完成”）",
    dashboard: "后台资料已保存",
    package: "安装包已上传",
    review: "已提交审核",
    yes: "是", no: "否", unknown: "未检查", notNeeded: "不需要（这次没有要填的）", none: "都没有发生（没上传，没提交）",
    required: "必须先做（做完并在后台点 Save draft）",
    advice: "建议检查",
    next: "下一步",
    open: "打开",
    paste: "粘贴（英文，按实际功能可改一句）：",
    usedAt: "代码位置：",
    noUsage: "代码里没找到对应调用——确认这个权限是否还需要",
    langCheck: (list) => `在页面顶部的语言下拉里逐个切换 ${list}，每种语言都要有：名称、简介、详细介绍（用该语言写，功能和默认语言一致）、截图（界面随语言变化时用该语言界面的截图）。`,
    langNew: (list) => `其中 ${list} 是新增语言，页面一定是空的。`,
    langRow: "各语言的名称／简介（来自安装包）：",
    hosts: "网站：",
    c: {
      ready: "预检通过，可以发布（还没上传）。",
      needsDashboard: (n) => `还没上传：后台有 ${n} 项必须先做。`,
      blocked: (v) => `没有上传：${v} 正在审核中，要等它审完。`,
      submitted: (state) => `已上传并提交审核，状态 ${state}。Google 审核通过前，用户看不到新版本。`,
      submittedStaged: (state) => `已上传并提交审核，状态 ${state}。审核通过后还要你手动发布（--staged）。`,
      uploadedOnly: "已上传，没有提交审核（--upload-only）。",
      uploadedNotSubmitted: "已上传，但提交审核被拒：后台还缺资料。",
      notListed: "失败：商店里找不到这个插件（没上架过，或 ID / 发布者 ID 不对）。",
      blockedSubmit: "没有提交：已有版本在审核中。",
      error: (m) => `失败：${m}`,
      packed: "已打包（离线，没碰商店）。",
    },
    n: {
      ready: (cmd) => `用户要发布时运行：${cmd}`,
      dashboard: (cmd) => `用户说“后台已保存”后运行：${cmd}`,
      blocked: (cmd) => `等审核结束再发布。只有用户明确说“撤回正在审核的版本”时，才运行：${cmd}`,
      rejected: (url, cmd) => `打开 ${url} 点 “Submit for review”，后台会显示缺哪一项；补好保存后运行：${cmd}（不会重新上传）`,
      submitted: (cmd) => `等审核结果；查进度：${cmd}。要把版本号提交到 git，等用户同意后再做。`,
      uploadedOnly: (cmd) => `要提交审核时运行：${cmd}`,
      notListed: "首次上架不归本工具：用上架资料流程（cx-chrome-store-submission 技能）准备商店文案、隐私答案和截图，在后台创建条目；拿到新 ID 后运行 bind 绑定，再回来发布（首发会先检查登录白名单、审核测试账号、支持页面）。",
      error: "按上面的错误修好，再运行 preflight。",
      packed: (file) => `ZIP：${file}`,
    },
    licenseWarn: (file) => `[许可] ${file} 像是第三方库，但旁边和文件头里都没有许可——把它的 LICENSE 放到旁边（如 ${file.replace(/(?:\.min)?\.(?:m?js|css)$/, "")}.LICENSE），以后打包会自动带上。`,
    storeWarn: (reason) => reason === "INCONSISTENT_LOCALE_METADATA" ? "[商店警告] 各语言商店页描述的功能不一致，去 Store listing 对齐（不影响审核）。" : `[商店警告] ${reason}`,
  },
  en: {
    begin: "======== REPORT (send this block to the user as is) ========",
    end: "======== END REPORT ========",
    conclusion: "Result",
    stages: "Stages (separate — none of them means “live”)",
    dashboard: "Dashboard saved",
    package: "Package uploaded",
    review: "Submitted for review",
    yes: "yes", no: "no", unknown: "not checked", notNeeded: "nothing to fill this time", none: "none happened (nothing uploaded or submitted)",
    required: "Required first (do them, then press Save draft)",
    advice: "Worth checking",
    next: "Next",
    open: "Open",
    paste: "Paste (edit one sentence if the feature differs):",
    usedAt: "used at:",
    noUsage: "no matching call in the code — is the permission still needed?",
    langCheck: (list) => `Switch the language selector at the top through ${list}. Each needs: name, summary, detailed description (in that language, same features as the default), screenshots (in that language when the UI is translated).`,
    langNew: (list) => `${list} ${list.includes(",") ? "are" : "is"} new, so those pages are empty.`,
    langRow: "Name / summary per language (from the package):",
    hosts: "hosts:",
    c: {
      ready: "Preflight passed — ready to publish (nothing uploaded yet).",
      needsDashboard: (n) => `Not uploaded: ${n} dashboard item${n > 1 ? "s" : ""} must be done first.`,
      blocked: (v) => `Not uploaded: ${v} is still in review.`,
      submitted: (state) => `Uploaded and submitted for review: ${state}. Users get it only after Google approves it.`,
      submittedStaged: (state) => `Uploaded and submitted for review: ${state}. After approval you still release it (--staged).`,
      uploadedOnly: "Uploaded, not submitted (--upload-only).",
      uploadedNotSubmitted: "Uploaded, but the submission was refused: the dashboard is missing something.",
      notListed: "Failed: the store has no such item (never listed, or a wrong extension/publisher ID).",
      blockedSubmit: "Not submitted: a version is already in review.",
      error: (m) => `Failed: ${m}`,
      packed: "Packaged (offline, the store wasn't touched).",
    },
    n: {
      ready: (cmd) => `When the user wants to publish, run: ${cmd}`,
      dashboard: (cmd) => `After the user says the dashboard is saved, run: ${cmd}`,
      blocked: (cmd) => `Wait for the review. Only if the user explicitly asks to withdraw it, run: ${cmd}`,
      rejected: (url, cmd) => `Open ${url} and press “Submit for review” to see what's missing; fix it, save, then run: ${cmd} (no re-upload)`,
      submitted: (cmd) => `Wait for the review; check with: ${cmd}. Commit the version bump only if the user agrees.`,
      uploadedOnly: (cmd) => `To submit, run: ${cmd}`,
      notListed: "A first listing isn't this tool's job: use the first-listing workflow (the cx-chrome-store-submission skill) for store copy, privacy answers and screenshots, and create the item in the dashboard. Then bind the new ID and come back — the first release checks sign-in allow-lists, a reviewer test account and the support page first.",
      error: "Fix the error above, then run preflight again.",
      packed: (file) => `ZIP: ${file}`,
    },
    licenseWarn: (file) => `[licence] ${file} looks third-party but has no licence beside it or in its header — put its LICENSE next to it; the next package picks it up.`,
    storeWarn: (reason) => reason === "INCONSISTENT_LOCALE_METADATA" ? "[store warning] the language pages describe different features — align them in Store listing (doesn't block review)." : `[store warning] ${reason}`,
  },
};

export function reportLanguage(option, env = process.env) {
  const value = String(option || env.XXD_CHROME_PUBLISH_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG || "").toLowerCase();
  return value.startsWith("zh") ? "zh" : "en";
}

/**
 * @param {object} input
 *   command, code, message, result, name, cmd(sub, extra) → command line
 * @param {"zh"|"en"} lang
 */
export function buildReport({ command, code, message, result, name, cmd }, lang = "en") {
  const t = T[lang] || T.en;
  const c = lang === "zh" ? "：" : ": ";
  const r = result || {};
  const lines = [t.begin];
  const version = r.version ? `${r.version.from} → ${r.version.to}` : "";
  lines.push(`${name || ""}${version ? `  ${version}` : ""}`.trim());

  // conclusion + next step
  let conclusion;
  let next;
  const required = (r.actions || []).filter((action) => action.blocking);
  const notListed = /was not found under publisher|Item not found/i.test(message || "");
  if (command === "pack") {
    conclusion = t.c.packed;
    next = t.n.packed(r.zipPath || "");
  } else if (notListed) {
    conclusion = t.c.notListed;
    next = t.n.notListed;
  } else if (r.submitted) {
    conclusion = (r.staged ? t.c.submittedStaged : t.c.submitted)(r.state);
    next = t.n.submitted(cmd("status"));
  } else if (code === 2) {
    const pending = r.store?.submitted?.versions?.join(", ") || "";
    conclusion = command === "submit" ? t.c.blockedSubmit : t.c.blocked(pending);
    next = t.n.blocked(cmd("publish", "--cancel-pending"));
  } else if (r.uploaded && code === 3) {
    conclusion = t.c.uploadedNotSubmitted;
    next = t.n.rejected(r.dashboardUrl || "", cmd("submit"));
  } else if (r.uploaded && !r.submitted && code === 0) {
    conclusion = t.c.uploadedOnly;
    next = t.n.uploadedOnly(cmd("submit"));
  } else if (code === 3 || (command === "preflight" && required.length)) {
    conclusion = t.c.needsDashboard(required.length);
    next = t.n.dashboard(cmd("publish", "--dashboard-ready"));
  } else if (command === "preflight" && code === 0) {
    conclusion = t.c.ready;
    next = t.n.ready(cmd("publish"));
  } else {
    conclusion = t.c.error(String(message || "").split("\n")[0]);
    next = t.n.error;
  }
  lines.push(`${t.conclusion}${c}${conclusion}`);

  if (r.stages) {
    const mark = (stage) => (stage.done === true ? t.yes : stage.done === false ? t.no : t.unknown);
    lines.push(`${t.stages}${c}`);
    lines.push(`- ${t.dashboard}${c}${r.stages.dashboard.notNeeded ? t.notNeeded : mark(r.stages.dashboard)}`);
    lines.push(`- ${t.package}${c}${mark(r.stages.uploaded)}${r.stages.uploaded.done && r.version?.to ? ` (${r.version.to}${r.package?.zipPath ? `, ${r.package.zipPath}` : ""})` : ""}`);
    lines.push(`- ${t.review}${c}${mark(r.stages.review)}${r.state ? ` (${r.state})` : ""}`);
  } else if (command !== "pack") {
    lines.push(`${t.stages}${c}${t.none}`);
  }

  // Required items only matter while they still block.
  if (required.length && !r.dashboardConfirmed) {
    lines.push(`${t.required}${c}`);
    required.forEach((action, index) => {
      lines.push(`${index + 1}. ${actionText(action, t, lang)}`);
      if (action.url) lines.push(`   ${t.open} ${action.url}`);
      for (const detail of actionDetails(action, t)) lines.push(`   ${detail}`);
    });
  }

  const advice = [];
  for (const action of (r.actions || []).filter((item) => !item.blocking)) advice.push(actionText(action, t, lang));
  for (const file of r.package?.unlicensed || []) advice.push(t.licenseWarn(file));
  for (const problem of r.locales?.problems || []) if (problem.severity === "warning") advice.push(`[${problem.locale}] ${problem.text}`);
  for (const warning of r.warnings || []) advice.push(t.storeWarn(warning.reason));
  for (const note of r.copyNotes || []) advice.push(note);
  if (advice.length) {
    lines.push(`${t.advice}${c}`);
    for (const item of advice) lines.push(`- ${item}`);
  }

  lines.push(`${t.next}${c}${next}`);
  lines.push(t.end);
  return lines.join("\n");
}

function actionText(action, t, lang) {
  if (lang !== "zh") return action.title;
  if (action.listing) {
    return `[商店页·多语言] 检查这 ${action.locales.length} 种语言的商店页：${action.locales.map((entry) => entry.locale).join("、")}`;
  }
  if (action.firstRelease) return `[首发] ${action.zh || action.title}`;
  if (action.permission === "host") return "[权限说明] 为新增的网站权限写用途说明";
  if (action.permission) return `[权限说明] 为新增的 "${action.permission}" 权限写用途说明`;
  return action.zh || action.title;
}

function actionDetails(action, t) {
  const details = [];
  if (action.listing) {
    const added = action.added || [];
    details.push(t.langCheck(action.locales.map((entry) => entry.locale).join(", ")) + (added.length ? ` ${t.langNew(added.join(", "))}` : ""));
    details.push(t.langRow);
    for (const entry of action.locales) details.push(`  ${entry.locale}: ${entry.name} ／ ${entry.description}`);
    return details;
  }
  if (action.hosts) details.push(`${t.hosts} ${action.hosts.join(", ")}`);
  if (action.draft) {
    details.push(t.paste);
    details.push(`  ${action.draft}`);
  }
  if (action.usage?.length) {
    details.push(`${t.usedAt} ${action.usage.slice(0, 3).map((hit) => `${hit.file}:${hit.line}`).join(", ")}`);
  } else if (action.usage && action.permission) {
    details.push(t.noUsage);
  }
  for (const note of action.notes || []) details.push(note);
  return details;
}
