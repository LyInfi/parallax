# Image Bench

同屏并排对比多个图像生成模型，自选最优结果保存，支持以结果为基础继续迭代。

## 开发

```bash
npm install
npm run dev   # http://localhost:3000
npm test      # 单元 + 集成
npm run e2e   # Playwright 端到端
```

## 架构要点

- **纯前端 BYOK**：API Key 仅存浏览器 localStorage，请求时作为 `x-api-key` 发给同源 `/api/generate`，后端不落盘、不写日志
- **插件式 ProviderAdapter**：`lib/providers/<name>.ts` 实现 `ProviderAdapter` 并在 `lib/providers/index.ts` 注册
- **SSE 流式**：`/api/generate` 以 Server-Sent Events 推送 `queued / progress / image / error / done`
- **本地画廊**：IndexedDB (Dexie)；图像保存、收藏、派生链追踪

## 新增一个模型 Adapter

1. 复制 `lib/providers/mock.ts` 到 `lib/providers/<your-model>.ts`
2. 实现 `ProviderAdapter`（见 `lib/providers/types.ts`）：声明 `capabilities`，实现 `generate()` 为 `AsyncIterable<GenerateEvent>`
3. 在 `lib/providers/index.ts` 的 `bootstrapProviders()` 里 `registerProvider(...)`
4. 为真实调用写单元测试（覆盖 2xx / 401 / 429 / 5xx / 超时）
