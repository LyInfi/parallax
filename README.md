# Parallax

> One prompt, many lenses. Side-by-side image generation across multiple AI models in your browser.
>
> 一条提示词，多重视角。在浏览器里同屏并排对比多家 AI 模型的图像生成结果。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

---

## English

**Parallax** is a browser-based workbench for comparing multiple image-generation models side-by-side. Bring your own API keys, throw one prompt at several providers in parallel, pick the best image, and iterate.

### Features

- **Side-by-side grid**: add as many model cards as you like, hit Generate once, watch images stream in independently per card
- **Unified size picker**: pick aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4) × quality tier (Standard / HD 2K / Ultra 4K); each adapter translates to its native format
- **Auto-saved gallery (IndexedDB)**: every generation is saved locally; tab between *All*, *Favorites*, and *Session history*
- **Iteration actions**: 🔄 regenerate with same prompt · 🔁 use image as reference for next round
- **BYOK, zero backend storage**: API keys live only in your browser's `localStorage`; the Next.js API route is a stateless CORS-proxy
- **Pluggable adapters**: add a new model by writing one file implementing `ProviderAdapter`

### Supported providers (out of the box)

| Provider | Model (default) | Notes |
|---|---|---|
| OpenRouter | `google/gemini-2.5-flash-image` | Uses `image_config.{aspect_ratio, image_size}` |
| Google Nano Banana 2 | `gemini-3.1-flash-image-preview` | Gemini API, native aspect support |
| 豆包 Seedream | `doubao-seedream-4-0-250828` | 火山方舟 OpenAI-compat endpoint |
| 即梦 Seedream | `jimeng-high-aes-general-v21-L` | Same endpoint, different model slug |
| 通义万相 Wan 2.7 | `wan2.7-image-pro` | Async task + polling |
| 腾讯混元生图 | — (TextToImageLite) | TC3-HMAC-SHA256 signed |
| **Gemini Web (Unofficial)** ⚠ | `gemini-3.0-pro` (+ Flash / 3.1 Pro Preview) | Reverse-engineered `gemini.google.com`. Cookie auth, ToS risk. See [Unofficial providers](#unofficial-providers). |

### Download

Parallax is a **desktop app** (Electron). Download the latest build for your platform from [GitHub Releases](https://github.com/LyInfi/parallax/releases):

| Platform | Artifact |
|---|---|
| macOS (Intel + Apple Silicon) | `Parallax-x.y.z.dmg` |
| Windows | `Parallax-Setup-x.y.z.exe` |
| Linux | `Parallax-x.y.z.AppImage` · `parallax_x.y.z_amd64.deb` |

After first launch, open **Settings** and paste in API keys for the providers you use.

Automatic updates: signed macOS / Windows builds self-update via GitHub Releases. Check / install from the tray menu (or wait for the toast).

### Zero-config networking

Parallax auto-detects your system proxy (macOS System Proxy, Windows Internet Options, Linux env vars) via Chromium's proxy resolver at boot. Clash / Surge / ShadowsocksX users: start the app with System Proxy mode on and every provider — including raw `fetch` to `api.anthropic.com` — routes through the proxy without any env-var fiddling.

Override: export `HTTPS_PROXY=http://host:port` before launch to force a specific proxy.

### Build from source

```bash
git clone https://github.com/LyInfi/parallax.git
cd parallax
npm install
npm run electron:dev            # launch desktop app against local Next server
npm run electron:build:mac      # produce .dmg + .zip in release/
npm run electron:build:win      # produce .exe
npm run electron:build:linux    # produce .AppImage + .deb
```

`npm run dev` still starts a plain Next.js web server at `http://localhost:3000` if you want to debug UI in a regular browser — but desktop-only features (tray, Gemini auto-login, auto-update, system-proxy detection) are unreachable there.

### Unofficial providers

Some providers (marked with ⚠ in the table above) are **reverse-engineered integrations of web frontends**, not official APIs. They are:

- **Against provider Terms of Service**. Use may result in account suspension or IP blocks.
- **Cookie-authenticated** (you paste cookies from your browser, not an API key).
- **Fragile**. Upstream protocol changes can break them without notice.

Each unofficial provider is gated behind an explicit **consent checkbox** in Settings. The Save button is disabled until you acknowledge the risk.

**Gemini Web (Unofficial)**: extracts images from the `gemini.google.com` StreamGenerate protocol. In the desktop app, click **Login to Gemini** in Settings — Parallax launches a fresh Chrome window with an isolated temp profile, you sign in normally, and it captures `__Secure-1PSID` / `__Secure-1PSIDTS` via Chrome DevTools Protocol. (Google's anti-embed protection blocks Electron's built-in WebView, hence the real-Chrome detour.) The `__Secure-1PSIDTS` cookie is refreshed automatically via `RotateCookies`. Override the Chrome path with `PARALLAX_CHROME_PATH=/path/to/chromium-family-binary`. Upstream credit: [HanaokaYuzu/Gemini-API](https://github.com/HanaokaYuzu/Gemini-API) (Python) + [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills) (TS port). See `lib/providers/gemini-webapi/NOTICE.md`.

### Tech stack

Electron 41 · Next.js 16 (App Router, Node runtime, standalone output) · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · Zustand · TanStack Query · Dexie · Zod · Vitest · Playwright · electron-builder · electron-updater

### Add a new provider

1. Copy `lib/providers/mock.ts` to `lib/providers/<your-provider>.ts`
2. Implement the `ProviderAdapter` interface (see `lib/providers/types.ts`)
3. Export a `resolveNative(spec: SizeSpec)` pure function for the size preview
4. Register in `lib/providers/index.ts`

### Scripts

```bash
npm run dev              # Next.js dev server only (browser at :3000)
npm run build            # production Next.js standalone build
npm run electron:dev     # build + launch Electron
npm run electron:build   # build Electron app for current OS
npm run release          # tag-driven CI does this via electron-builder --publish always
npm test                 # unit + integration (Vitest)
npm run e2e              # end-to-end (Playwright)
```

### Contributing

Issues and PRs welcome. Please run `npm test && npx tsc --noEmit` before submitting.

### License

[MIT](./LICENSE) © 2026

---

## 中文

**Parallax**（视差）是一个浏览器端的多模型图像生成工作台。自带 API Key、一条提示词并发投给多家模型，同屏对比、挑选最佳、继续迭代。

### 核心功能

- **网格并列对比**：想加几张卡片加几张，一次 Generate 各卡独立流式出图
- **统一尺寸体系**：选「宽高比 × 质量等级」（1:1 / 16:9 / 9:16 / 4:3 / 3:4 × 标准 / 高清 2K / 超清 4K），各 adapter 自动翻译成模型原生格式
- **自动画廊（IndexedDB）**：所有生成自动本地留档；支持「全部 / 收藏 / 会话」三视图
- **迭代操作**：🔄 按当前提示词重新生成 · 🔁 把这张图作为参考图继续下一轮
- **BYOK 零后端存储**：API Key 只存在你自己浏览器的 `localStorage`；Next.js API Route 只做无状态转发，解决 CORS
- **插件式适配层**：新加模型 = 写一个实现 `ProviderAdapter` 的文件

### 预置模型

| 厂商 | 默认模型 | 备注 |
|---|---|---|
| OpenRouter | `google/gemini-2.5-flash-image` | 用 `image_config.{aspect_ratio, image_size}` |
| Google Nano Banana 2 | `gemini-3.1-flash-image-preview` | Gemini 官方 API，原生 aspect |
| 豆包 Seedream | `doubao-seedream-4-0-250828` | 火山方舟 OpenAI 兼容接口 |
| 即梦 Seedream | `jimeng-high-aes-general-v21-L` | 同 endpoint，换 model id |
| 通义万相 Wan 2.7 | `wan2.7-image-pro` | 异步任务 + 轮询 |
| 腾讯混元生图 | — (TextToImageLite) | TC3-HMAC-SHA256 签名 |
| **Gemini Web（非官方）** ⚠ | `gemini-3.0-pro`（含 Flash / 3.1 Pro Preview） | 逆向 `gemini.google.com` 网页端，Cookie 认证，违反 ToS，见 [非官方 Provider](#非官方-provider) |

### 下载

Parallax 是 **桌面应用**（Electron）。从 [GitHub Releases](https://github.com/LyInfi/parallax/releases) 下载对应平台的安装包：

| 平台 | 文件 |
|---|---|
| macOS（Intel + Apple Silicon）| `Parallax-x.y.z.dmg` |
| Windows | `Parallax-Setup-x.y.z.exe` |
| Linux | `Parallax-x.y.z.AppImage` · `parallax_x.y.z_amd64.deb` |

首次启动后到 **Settings** 填你有的 API Key 即可开始。

macOS/Windows 签名版本会通过 GitHub Releases **自动更新**，托盘菜单或通知弹窗里点"重启安装"即可。

### 零网络配置

启动时 Parallax 通过 Chromium 的代理解析器自动读取系统代理（macOS 系统偏好的 HTTP Proxy / Windows Internet Options / Linux env），Clash / Surge / ShadowsocksX 在 **System Proxy 模式**下无需任何额外配置，所有 provider 的 `fetch`（包括 `api.anthropic.com` / `api.openai.com` 这类直连海外的）自动走代理。

想强制指定代理：启动前 export `HTTPS_PROXY=http://host:port` 即可。

### 本地开发 / 从源码构建

```bash
git clone https://github.com/LyInfi/parallax.git
cd parallax
npm install
npm run electron:dev            # 本地拉起桌面端
npm run electron:build:mac      # 产出 macOS DMG + zip
npm run electron:build:win      # 产出 Windows NSIS 安装包
npm run electron:build:linux    # 产出 Linux AppImage + deb
```

`npm run dev` 仍可拉起传统 Next.js web 服务（`http://localhost:3000`）用于调试 UI，但桌面端独占的功能（托盘、Gemini 自动登录、auto-update、系统代理自动探测）都不可达。

### 非官方 Provider

表格里带 ⚠ 的 provider 是 **逆向网页端协议** 的集成，不是官方 API：

- **违反 provider 服务条款**，可能导致账号被封或 IP 被限流
- **Cookie 认证**（从浏览器 DevTools 复制 cookie，而不是 API key）
- **脆弱**，上游改协议就会失效

每个非官方 provider 在 Settings 都有 **风险确认勾选框**，不勾不让保存。

**Gemini Web（非官方）**：通过 `gemini.google.com` 的 `StreamGenerate` 内部接口出图。桌面端在 Settings 里点 **"登录 Gemini"** 即可 — Parallax 会用本机 Chrome 启动一个临时 profile 的全新窗口，你正常登录 Google，cookie 通过 Chrome DevTools Protocol 自动抓回（Google 会拦 Electron 内嵌浏览器，所以绕道真 Chrome）。`__Secure-1PSIDTS` 通过 `RotateCookies` 自动刷新。没装 Chrome？设 `PARALLAX_CHROME_PATH=/path/to/chromium-family-binary` 指向 Edge / Brave / Chromium 均可。上游致谢：[HanaokaYuzu/Gemini-API](https://github.com/HanaokaYuzu/Gemini-API)（Python 原版）+ [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills)（TS port 来源）。详见 `lib/providers/gemini-webapi/NOTICE.md`。

### 技术栈

Electron 41 · Next.js 16（App Router，Node runtime，standalone 输出）· React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · Zustand · TanStack Query · Dexie · Zod · Vitest · Playwright · electron-builder · electron-updater

### 新增模型 Adapter

1. 复制 `lib/providers/mock.ts` 为 `lib/providers/<your-provider>.ts`
2. 实现 `ProviderAdapter` 接口（见 `lib/providers/types.ts`）
3. 导出 `resolveNative(spec: SizeSpec)` 纯函数供尺寸预览使用
4. 到 `lib/providers/index.ts` 注册

### 脚本

```bash
npm run dev              # 只起 Next.js web 服务（用于 UI 调试）
npm run build            # Next.js standalone 生产构建
npm run electron:dev     # 打包 + 拉起桌面端
npm run electron:build   # 打包当前平台桌面端
npm run release          # CI 里打 tag 触发的多平台发布（--publish always）
npm test                 # Vitest 单元 + 集成
npm run e2e              # Playwright 端到端
```

### 贡献

欢迎 Issue / PR。提交前请先跑 `npm test && npx tsc --noEmit`。

### 许可

[MIT](./LICENSE) © 2026
