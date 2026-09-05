# endoretic.cc

Astro + TypeScript 静态个人档案站，包含六个项目、Notes、个人介绍及 Credits。内容事实以 `src/content/` 和 `src/locales/en.json` 为准；项目记录已不再是初始化占位页。

## 运行与检查

要求 Node.js ≥22.12、npm ≥9.6.5；CI 使用 Node.js 24。依赖版本以 `package-lock.json` 为准。

```sh
npm ci
npm run dev
npm run build
npm test
npm run preview
```

`build` 顺序执行 `assets:check`、`check`（Astro 类型与内容检查）和 Astro 构建，输出 `dist/`。需要单独排查时才执行 `npm run assets:check` 或 `npm run check`。测试依赖最新构建，覆盖静态输出、媒体清单、草稿、日期、颜色 token 对比度及语言层静态输出契约。测试不再锁定 CSS 坐标、组件调用方式、哈希常量或事件绑定源码；没有单独配置的浏览器测试命令。交互改动时仍需在浏览器检查键盘焦点、语言切换/退出、跨页音频、媒体失败与 reduced motion。

核心内容与导航不依赖 JS。现有 Astro ClientRouter 保持跨页音频，外部项目子站使用完整页面导航。Hymmnos 词表和字体在启用语言层后才请求；控制脚本本身正常随页加载。

## 内容维护

在 `src/content/projects/` 或 `src/content/notes/` 添加 Markdown/MDX。完整 schema 是 `src/content.config.ts`，不要在文档维护第二份 schema。

共同必填项是 `title`、`lang`（`en` / `zh-CN`）；`draft` 默认 true，生产不发布草稿，开发环境可预览。`tags` 可选。

```yaml
# 项目最小示例
---
title: "Project title"
summary: "有来源的项目说明"
lang: "en"
draft: true
---
```

项目可用字段：`featured`、`placeholder`、`status`、`year`、`repo`、`demo`、`coverAssetId`。历史 `coverScene` 字段仍在 schema 和内容中，但当前卡片不读取它。

```yaml
# 公开笔记最小示例
---
title: "笔记标题"
description: "作者提供的摘要"
lang: "zh-CN"
draft: false
publishedAt: 2026-09-05
updatedAt: 2026-09-05
---
```

公开笔记必须有首次发表与最后修改日期；列表按 `publishedAt` 倒序，详情显示 `updatedAt`。可见日期使用 ISO 周日期，HTML datetime 保持日历日期。可选 `readingMode`（paper / dark）、`coverAssetId`、`fictionalized`；后者为重构性文字显示提示。不要把示例稿或 AI 占位文字当作者定稿发布。

带图笔记默认使用 paper，并将图片及图注放在正文顶层 `<figure>` 中。宽屏将图版及图注放在右侧，正文整段排列于左侧，起点低于图版的后续段落接续全宽；移动端保持上下排列。不需要逐篇增加布局字段。

## 文案与素材

- 界面英文：`src/locales/en.json`，Astro 通过 `t()` / `key()` 标记；内容语言仍由各条目的 `lang` 决定。
- Hymmnos：`src/locales/hymmnos.json` 与 `hymmnos-content.json`；它是可选视觉层，抽象意译、借词与信息丢失标记见 `docs/HYMMNOS_LAYER.md`。
- 第三方媒体：`src/data/assets.yml` 是来源、许可、署名、修改与使用页面的唯一清单；`active` 才能进入页面，`proposed` 只是历史候选。
- 文件自托管于 `public/media/`。原创图像生产衍生文件在 `generated/`；工作母版在 `assets/source/`，不会部署。`public/` 内的文件即使未引用也会复制到产物。
- `docs/MEDIA.md` 保留生成记录、照片授权与来源线索；新增原创衍生文件需同步 `tests/visual-contract.test.mjs` 的现有清单。

## 部署

`.github/workflows/deploy.yml` 在 main push 或手动触发时构建、测试、核对 CNAME 并发布 `dist/`。`verify.yml` 仅在 PR 或手动触发时验证，没有发布权限；main push 不再重复跑 verify。CNAME 的目标域名及与 public/CNAME 的一致性由产物测试统一验证。

`public/CNAME` 为 `endoretic.cc`；根 `index.html` 与根 `CNAME` 是旧分支发布后备，不是 Astro 首页。独立项目 `/pjsk-tier-maker/` 与 `/score-calculator/` 由各自仓库提供；本站项目页在 `/works/<slug>/`，不要占用子站路径。

外部设置需要核查时，检查 Pages Source=GitHub Actions、自定义域名、HTTPS 与 Actions 运行结果；应用改动不自动变更 Cloudflare。线上状态以实时检查为准，不沿用旧文档里的 404 或 DNS 快照。回滚通常恢复已知良好提交并重新部署；恢复旧分支发布需要同时调整 Pages Source。

## 本地文档

`AGENTS.md` 与 `docs/` 被 Git 忽略，不随普通提交上传。当前只维护四份专题文档：

- `docs/DESIGN.md`：当前视觉决定与生成美术基线。
- `docs/MEDIA.md`：媒体来源、母版与授权记录。
- `docs/HYMMNOS_LAYER.md`：语言层机制、质量评估和黑块方案。
- `docs/AUDIT.md`：2026-09-05 整理范围、代码发现与验证结果。

旧的“项目介绍、个人信息及文章全部待补”已失效。现存 `[TODO]` 位于未发布的 `draft-template.md` 和三条 proposed 素材的待定 note slug；字体来源/条款记录仍有缺口，见媒体文档。RSS 等旧提案未实现，不视为本轮待办。
