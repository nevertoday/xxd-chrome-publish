# xxd-chrome-publish

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

给**已经上架 Chrome 应用商店**的插件发更新：在终端里敲一条命令，或者直接跟 Claude Code / Codex 说一声，
它就会构建、跑检查、打包、和商店上的版本对比，然后上传、提交审核。

和普通上传脚本最大的不同是**预检**：上传之前先告诉你，商店会因为什么拒掉这次提交。

```
$ xxd-chrome-publish preflight
图片裁剪工具 · ~/code/crop · phdjhhjbapkmagifbejfabimojmjngbe
  store     PUBLISHED 1.0.26
  version   1.0.26 → 1.0.27
  package   27 files · 249 KB
  manifest  vs store: +hosts https://api.example.com/*
  dashboard 1 to-do:
    [required] Justify the new host permissions
    open https://chrome.google.com/webstore/devconsole/…/edit/privacy
  => NEEDS DASHBOARD — 先在后台填好 [required] 项并保存，再加 --dashboard-ready 发布
```

## 为什么要做这个

Chrome 商店的 API 只能“传包”和“提交”。权限用途说明、数据使用声明、隐私政策链接、商店描述，**只能在后台网页里改**。
所有命令行工具（包括 chrome-webstore-upload-cli）都过不了这一关，典型症状是：上传成功了，
提交时却报 `does not meet the requirements`。

这个工具会下载商店上正在用的版本，和你本地的 manifest 对比，列出哪些新权限、新站点需要写说明，
还会指出代码里哪几行用到了它们，写说明一分钟就够。它还修掉了实际踩过的几个打包坑：

- **按需注入的文件**：`executeScript({ files: [...] })`、`{ panel: ["build/panel.js"] }` 这种写法也会被打进包里。只顺着引用找文件的打包器会悄悄漏掉它们。
- **构建产物过期**：先跑项目自己的 `build` 和 `check`，失败就不上传。
- **文件缺失**：manifest 里写了但文件不存在，上传前就拦下来。
- **版本号撞车**：新版本号同时参考本地和商店（包括已发布的和审核中的），商店版本比本地新也不会被拒。
- **正在审核**：提前发现，不会传到一半才失败。

## 安装

作为 AI 助手的技能（Claude Code、Codex 等）：

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Codex 用 ~/.codex/skills
```

把仓库放在技能目录外面再软链进去，`git pull` 就能原地更新技能，改起来也和普通项目一样。
之后直接说“把这个插件发了”“看看哪些插件可以发”就行。

作为命令行工具（需要 Node 18+，没有其他依赖）：

```bash
sh ~/code/xxd-chrome-publish/scripts/install.sh   # 链接成 ~/.local/bin/xxd-chrome-publish
```

以后更新只要 `git -C ~/code/xxd-chrome-publish pull`，技能软链和命令都指向这份仓库。

## 一次性配置

```bash
xxd-chrome-publish setup --publisher-id <后台网址里的 ID>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<项目>.iam.gserviceaccount.com
#   或者设置 CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN 环境变量（OAuth，适合 CI）
cd 插件目录 && xxd-chrome-publish bind --extension-id <扩展 ID 或商店链接>
xxd-chrome-publish doctor
```

两种登录方式的详细步骤见 [references/setup.md](references/setup.md)。特别提醒：服务账号要填在后台
Account 页的 **service account** 那一栏，不是旁边的 “Trusted tester accounts”（受信任测试员）。
那一栏没有 API 权限，填错了会一直 403。

## 日常用法

```bash
xxd-chrome-publish preflight        # 只看会发生什么，什么都不改
xxd-chrome-publish                  # 发布：构建 → 检查 → 打包 → 对比 → 上传 → 提交
xxd-chrome-publish submit           # 后台补完资料后，提交已上传的草稿（不重新上传）
xxd-chrome-publish scan ~/code      # 一览所有插件：本地 / 商店版本、审核状态、没发布的提交数
xxd-chrome-publish status | pack | cancel | rollout 50
```

常用参数：`--minor`、`--major`、`--set-version X`、`--no-bump`、`--skip-build`、`--skip-checks`、
`--dashboard-ready`、`--cancel-pending`、`--upload-only`、`--staged`、`--zip 路径`、`--commit`、`--json`。
退出码：`0` 成功 · `1` 出错 · `2` 有版本正在审核 · `3` 需要先去后台补资料。

每个插件自己的配置写在 `.chrome-publish.json` 里：

```json
{
  "extensionId": "abcdefghijklmnopabcdefghijklmnop",
  "build": "npm run build",
  "check": false,
  "packageDir": "dist",
  "include": ["assets/models/**"],
  "exclude": ["fixtures/**"]
}
```

`build` / `check` 写命令或 `false`（默认用 package.json 里的同名脚本），`packageDir` 是构建输出目录，
`include` / `exclude` 用来强制加入或排除文件。

## 它做不到的

首次上架、修改商店描述和截图、填隐私页。Google 没有提供这些 API，Chrome 也不允许任何浏览器插件
（包括 AI 浏览器助手）操作商店页面。工具会告诉你具体要填什么，怎么写权限说明可以参考
[references/dashboard.md](references/dashboard.md)。

## 开发

```bash
npm test   # 单元测试 + 对本地假商店的端到端测试
```

MIT 许可。
