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

### Quick start

```bash
git clone https://github.com/LyInfi/parallax.git
cd parallax
npm install
npm run dev   # open http://localhost:3000
```

Then visit **Settings** to paste in API keys for any providers you want to use.

### Tech stack

Next.js 16 (App Router, Node runtime) · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · Zustand · TanStack Query · Dexie · Zod · Vitest · Playwright

### Add a new provider

1. Copy `lib/providers/mock.ts` to `lib/providers/<your-provider>.ts`
2. Implement the `ProviderAdapter` interface (see `lib/providers/types.ts`)
3. Export a `resolveNative(spec: SizeSpec)` pure function for the size preview
4. Register in `lib/providers/index.ts`

### Scripts

```bash
npm run dev     # local dev server
npm run build   # production build
npm test        # unit + integration tests (Vitest)
npm run e2e     # end-to-end tests (Playwright)
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

### 快速开始

```bash
git clone https://github.com/LyInfi/parallax.git
cd parallax
npm install
npm run dev   # 打开 http://localhost:3000
```

访问 **Settings** 页填入你有的 Key 即可开始。

### 技术栈

Next.js 16（App Router，Node runtime）· React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · Zustand · TanStack Query · Dexie · Zod · Vitest · Playwright

### 新增模型 Adapter

1. 复制 `lib/providers/mock.ts` 为 `lib/providers/<your-provider>.ts`
2. 实现 `ProviderAdapter` 接口（见 `lib/providers/types.ts`）
3. 导出 `resolveNative(spec: SizeSpec)` 纯函数供尺寸预览使用
4. 到 `lib/providers/index.ts` 注册

### 脚本

```bash
npm run dev     # 本地开发
npm run build   # 生产构建
npm test        # 单元 + 集成测试 (Vitest)
npm run e2e     # 端到端测试 (Playwright)
```

### 贡献

欢迎 Issue / PR。提交前请先跑 `npm test && npx tsc --noEmit`。

### 许可

[MIT](./LICENSE) © 2026
