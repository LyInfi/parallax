# 多模型图像生成对比工作台 — 设计文档

- **日期**：2026-04-14
- **状态**：设计草案（待用户复核）
- **作者**：brainstorming session

## 1. 目标与范围

一个 Web 应用，允许用户：

1. 在设置页填入自己持有的各模型 API Key（localStorage，纯前端）
2. 在工作台同屏并排对比多个图像生成模型：用同一个提示词（可附参考图）一次性触发所有已选模型，各自独立出图
3. 从多张结果中挑选最喜欢的图，保存到本地画廊（IndexedDB），并可下载
4. 以任一已生成图为基础继续迭代（img2img + 新提示词），用户自选下一轮参与的模型
5. 通过会话历史回看每次生成的完整上下文，并在派生链中追踪图像演化

### 非目标（首版不做）

- 用户账户体系 / 云端同步
- 平台兜底 API Key（BYOK only）
- 支付、额度、运营后台
- 视频生成、音频生成
- 多设备同步

## 2. 技术栈

- **Next.js 16.2.3**（App Router，Node runtime，本地运行无 Serverless 超时约束）
- **React 19 + TypeScript 5**
- **Tailwind CSS v4 + shadcn/ui**
- **Zustand**（本地状态）
- **TanStack Query v5**（请求生命周期、取消、重试）
- **Dexie.js**（IndexedDB 封装）
- **Zod**（运行时校验）
- **Vitest + React Testing Library + Playwright**（测试）

## 3. 架构

```
浏览器 (Next.js 前端)
  ModelGrid / PromptBar / Gallery / Settings
  Zustand (选中模型 / Key / 会话) + TanStack Query (每卡请求态)
  ─── fetch(POST /api/generate) + SSE (ReadableStream 解析) ─→
Next.js API Route  (/api/generate, Node runtime)
  Provider Adapter Layer
    ├─ types.ts (ProviderAdapter 接口)
    ├─ registry.ts (注册表 + capabilities)
    └─ <provider>.ts (一文件一模型)
  ─── HTTPS ─→ 各厂商 API
```

核心设计原则：

- **无后端存储**：后端只做请求转发 + SSE 事件归一化，不存 Key、不存图、不写日志
- **API Key 生命周期**：仅存于浏览器 localStorage，请求时作为 HTTP header 发给同源 `/api/generate`，后端用完即弃
- **插件式适配层**：新增模型 = 新增一个实现 `ProviderAdapter` 的文件并在 registry 注册
- **格间隔离**：每个对比卡片独立生命周期（独立请求、独立状态、独立取消、独立错误）

## 4. UI / 交互

- **工作台（`/`）**：自适应网格卡片（2→1×2, 3→1×3, 4→2×2, ...），末位"+"卡添加新对比格；每卡顶部显示模型名可切换，右上角 ❤️ 保存、⬇ 下载、🔁 以此为基础继续；底部 PromptBar 含大 textarea 提示词 + 附件拖拽/粘贴上传（≤10MB，自动压缩）+ 生成/停止按钮 + 全局参数（尺寸/张数/seed 可选）
- **画廊（`/gallery`）**：按会话分组展示，同 `parentAssetId` 形成树状派生链可视化，点节点可跳回"以此为基础继续"
- **设置（`/settings`）**：各模型 Key 表单 + 测试连接按钮；Key 按模型分组，capabilities 从 `/api/models` 读取

## 5. 数据模型

```ts
type ProviderAdapter = {
  id: string                        // 'openai-gpt-image-1'
  displayName: string
  capabilities: {
    textToImage: boolean
    imageToImage: boolean
    maxImages: number
    sizes: string[]
  }
  generate(
    input: GenerateInput,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateEvent>
}

type GenerateInput = {
  prompt: string
  referenceImages?: Blob[]          // img2img 参考图
  size?: string
  n?: number
  seed?: number
  providerOverrides?: Record<string, unknown>  // 高级抽屉的单模型参数
}

type GenerateEvent =
  | { type: 'queued' }
  | { type: 'progress'; pct?: number; message?: string }
  | { type: 'image'; url: string; index: number }
  | { type: 'error'; code: string; message: string; retryable: boolean }
  | { type: 'done' }

type Session = {
  id: string
  createdAt: number
  parentAssetId?: string            // 形成派生链
  prompt: string
  attachments: AssetRef[]
  params: { size?: string; n?: number; seed?: number }
  cards: Array<{
    cardId: string
    providerId: string
    status: 'idle' | 'queued' | 'running' | 'done' | 'error'
    images: AssetRef[]
    error?: { code: string; message: string }
  }>
}

type Asset = {                      // IndexedDB (Dexie)
  id: string
  sessionId: string
  providerId: string
  blob: Blob                        // 原图
  thumbBlob: Blob                   // 缩略图
  meta: {
    prompt: string
    params: Session['params']
    createdAt: number
    favorited: boolean
    parentAssetId?: string
  }
}
```

## 6. 目录结构

```
app/
  page.tsx                          工作台
  gallery/page.tsx                  画廊
  settings/page.tsx                 Key 管理
  api/
    generate/route.ts               SSE 生图入口
    models/route.ts                 模型清单 + capabilities

components/
  workbench/
    ModelGrid.tsx
    ModelCard.tsx                   状态机 idle→queued→running→done/error
    AddModelCard.tsx
    ModelPicker.tsx
    PromptBar.tsx
    AttachmentUploader.tsx
    ImageActions.tsx
  gallery/
    GalleryGrid.tsx
    SessionTimeline.tsx             派生链可视化
  settings/KeyManager.tsx
  ui/                               shadcn/ui

lib/
  providers/
    types.ts
    registry.ts
    _template.ts                    新增模型模板
  sse/
    server.ts                       Node 端 SSE writer
    client.ts                       浏览器端 fetch+stream SSE hook
  storage/
    keys.ts                         localStorage 封装
    gallery.ts                      Dexie 封装
  store/
    useModelStore.ts
    usePromptStore.ts
    useSessionStore.ts

types/index.ts
```

## 7. 关键流程

### 7.1 单次生成

1. 用户在 PromptBar 输入提示词、拖入参考图、点生成
2. 前端创建 `sessionId`，为每个 ModelCard 触发独立请求：`fetch('/api/generate', { method: 'POST', body: { providerId, prompt, attachments(base64), params, apiKey } })`
3. 后端在 Node runtime 返回 SSE 响应流：校验 body → `registry.get(providerId)` → `for await (evt of adapter.generate(...)) enqueue(evt)`
4. 前端按事件更新卡片状态；收到 `image` 事件时把图写入 `useSessionStore`
5. 用户 ❤️ → `gallery.putAsset(Dexie)`；⬇ → `a[download]`
6. 用户 🔁 → 弹 ModelPicker 选参与模型 → 建新 session 且 `parentAssetId=当前图`，进入步骤 2

### 7.2 取消

前端 `AbortController.abort()` → fetch 流中断 → 后端 `req.signal` 触发 → adapter 调厂商 cancel（若支持），关闭 SSE 流。

## 8. 错误处理

| 层 | 处理 |
|---|---|
| 前端校验（空提示词/无模型/文件过大） | Zod + 按钮禁用 + 内联提示 |
| Key 缺失 | 卡片显示"请先在设置填入 Key" + 跳转按钮 |
| 网络/API Route 失败 | SSE `error` 事件 + 卡片显示 + 重试按钮 |
| 厂商 401 / 429 / 5xx / 超时 | Adapter 归一化为 `GenerateError { code, message, retryable }` |
| 流中断 | AbortController + 卡片置 error，不影响其它卡 |

原则：格间隔离；不吞异常；API Key 绝不写日志；附件 ≤10MB 硬上限。

## 9. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| Adapter 单元 | Vitest + msw-node | 请求构造、响应归一化、错误映射 |
| Storage / Store 单元 | Vitest + fake-indexeddb | Dexie 读写、派生链查询、Zustand 状态转换 |
| API Route 集成 | Vitest + Next test utils | SSE 事件序列 `queued→progress→image→done` 及 error 路径 |
| 组件 | Vitest + RTL | ModelCard 状态机、PromptBar 禁用逻辑、ImageActions 交互 |
| E2E | Playwright | 填 Key → 选 3 模型 → 生成（mock）→ ❤️保存 → 画廊可见 → 派生链 |
| 手测 | — | 真实厂商 Key 跑通（新增模型必做） |

TDD 纪律：`ProviderAdapter` 接口与 `/api/generate` SSE 协议先写测试后实现；UI 组件写完手测 + 关键断言即可。

## 10. 首版交付范围

- 工作台页、画廊页、设置页
- `ProviderAdapter` 接口、registry、SSE 工具、一个示例 adapter（`_template.ts` + 一个可跑通的示例，如 OpenAI gpt-image-1，便于验证骨架）
- localStorage Key 存取、Dexie 画廊、会话派生链
- 生成 / 取消 / 重试 / ❤️保存 / ⬇下载 / 🔁以此为基础继续
- 全局参数（尺寸、张数、seed）+ 每模型高级参数抽屉
- 完整错误处理与测试

后续扩展（不在首版）：更多 adapter、Key 浏览器端对称加密、SSE 断线重连、画廊导出/导入、提示词模板库。
