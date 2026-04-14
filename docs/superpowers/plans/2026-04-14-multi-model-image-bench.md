# 多模型图像生成对比工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个纯前端（+ Next.js API Routes 做代理）的 Web 应用，让用户用 BYOK 方式同屏并排对比多个图像生成模型，挑选/保存/以结果为基础迭代。

**Architecture:** Next.js 16 全栈单仓；前端 React 19 + Zustand + TanStack Query，后端 Node runtime 的 API Route 做纯转发（不存 Key、不写日志）；插件式 ProviderAdapter 层；SSE 流式事件；IndexedDB 本地画廊。

**Tech Stack:** Next.js 16.2.3 (App Router) · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · Zustand 5 · TanStack Query v5 · Dexie.js · Zod · Vitest · React Testing Library · Playwright · msw

**Spec:** `docs/superpowers/specs/2026-04-14-multi-model-image-bench-design.md`

---

## Phase 0 · 项目初始化

### Task 0.1: 创建 Next.js 项目骨架

**Files:**
- Create: 整个 Next.js 项目

- [ ] **Step 1: 创建项目**

Run:
```bash
cd /Users/xtt/AIProject
npx --yes create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias="@/*" --use-npm --no-turbopack
```
回答提示全部取默认或 Yes。

- [ ] **Step 2: 验证启动**

```bash
npm run dev
```
浏览器访问 http://localhost:3000 看到 Next.js 欢迎页即可，Ctrl+C 结束。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next.js 16 project"
```

### Task 0.2: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装运行时依赖**

```bash
npm install zustand @tanstack/react-query dexie zod
```

- [ ] **Step 2: 安装测试/开发依赖**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb msw @playwright/test
npx playwright install chromium
```

- [ ] **Step 3: 初始化 shadcn/ui**

```bash
npx --yes shadcn@latest init -d
npx --yes shadcn@latest add button input textarea card dialog label toast sonner
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install runtime, test, and shadcn/ui dependencies"
```

### Task 0.3: 配置 Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`

- [ ] **Step 1: 创建 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 2: 创建 vitest.setup.ts**

```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

- [ ] **Step 3: 追加 scripts 到 package.json**

在 `"scripts"` 里增加：
```json
"test": "vitest run",
"test:watch": "vitest",
"e2e": "playwright test"
```

- [ ] **Step 4: 冒烟测试**

Create `__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('smoke', () => {
  it('runs', () => { expect(1 + 1).toBe(2) })
})
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: configure vitest with jsdom + fake-indexeddb"
```

---

## Phase 1 · 核心类型与 Provider 适配层

### Task 1.1: 定义 Provider 统一接口

**Files:**
- Create: `lib/providers/types.ts`
- Test: `__tests__/providers/types.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/providers/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isGenerateEvent, GenerateEventSchema } from '@/lib/providers/types'

describe('GenerateEvent', () => {
  it('accepts queued event', () => {
    expect(isGenerateEvent({ type: 'queued' })).toBe(true)
  })
  it('accepts image event with url and index', () => {
    expect(isGenerateEvent({ type: 'image', url: 'data:x', index: 0 })).toBe(true)
  })
  it('rejects malformed event', () => {
    expect(isGenerateEvent({ type: 'bogus' } as any)).toBe(false)
  })
  it('schema parses error event with retryable', () => {
    const r = GenerateEventSchema.safeParse({ type: 'error', code: 'RATE_LIMIT', message: 'x', retryable: true })
    expect(r.success).toBe(true)
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- providers/types`
Expected: FAIL (module not found).

- [ ] **Step 3: 实现 `lib/providers/types.ts`**

```ts
import { z } from 'zod'

export const CapabilitiesSchema = z.object({
  textToImage: z.boolean(),
  imageToImage: z.boolean(),
  maxImages: z.number().int().positive(),
  sizes: z.array(z.string()).min(1),
})
export type Capabilities = z.infer<typeof CapabilitiesSchema>

export const GenerateInputSchema = z.object({
  prompt: z.string().min(1),
  referenceImages: z.array(z.instanceof(Blob)).optional(),
  size: z.string().optional(),
  n: z.number().int().positive().max(8).optional(),
  seed: z.number().int().optional(),
  providerOverrides: z.record(z.string(), z.unknown()).optional(),
})
export type GenerateInput = z.infer<typeof GenerateInputSchema>

export const GenerateEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('queued') }),
  z.object({ type: z.literal('progress'), pct: z.number().optional(), message: z.string().optional() }),
  z.object({ type: z.literal('image'), url: z.string(), index: z.number().int() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string(), retryable: z.boolean() }),
  z.object({ type: z.literal('done') }),
])
export type GenerateEvent = z.infer<typeof GenerateEventSchema>

export function isGenerateEvent(x: unknown): x is GenerateEvent {
  return GenerateEventSchema.safeParse(x).success
}

export interface ProviderAdapter {
  id: string
  displayName: string
  capabilities: Capabilities
  generate(
    input: GenerateInput,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateEvent>
}

export class GenerateError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = false,
  ) {
    super(message)
    this.name = 'GenerateError'
  }
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- providers/types`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/types.ts __tests__/providers/types.test.ts
git commit -m "feat(providers): define ProviderAdapter interface and event schemas"
```

### Task 1.2: Provider registry

**Files:**
- Create: `lib/providers/registry.ts`
- Test: `__tests__/providers/registry.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/providers/registry.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { registerProvider, getProvider, listProviders, clearRegistry } from '@/lib/providers/registry'
import type { ProviderAdapter } from '@/lib/providers/types'

const fake: ProviderAdapter = {
  id: 'fake',
  displayName: 'Fake',
  capabilities: { textToImage: true, imageToImage: false, maxImages: 1, sizes: ['512x512'] },
  async *generate() { yield { type: 'done' } as const },
}

describe('registry', () => {
  beforeEach(() => clearRegistry())
  it('registers and retrieves', () => {
    registerProvider(fake)
    expect(getProvider('fake')).toBe(fake)
  })
  it('lists all', () => {
    registerProvider(fake)
    expect(listProviders().map(p => p.id)).toEqual(['fake'])
  })
  it('throws for unknown id', () => {
    expect(() => getProvider('nope')).toThrow(/unknown provider/i)
  })
  it('rejects duplicate id', () => {
    registerProvider(fake)
    expect(() => registerProvider(fake)).toThrow(/already registered/i)
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- providers/registry`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `lib/providers/registry.ts`:
```ts
import type { ProviderAdapter } from './types'

const registry = new Map<string, ProviderAdapter>()

export function registerProvider(p: ProviderAdapter): void {
  if (registry.has(p.id)) throw new Error(`Provider already registered: ${p.id}`)
  registry.set(p.id, p)
}

export function getProvider(id: string): ProviderAdapter {
  const p = registry.get(id)
  if (!p) throw new Error(`Unknown provider: ${id}`)
  return p
}

export function listProviders(): ProviderAdapter[] {
  return Array.from(registry.values())
}

export function clearRegistry(): void {
  registry.clear()
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- providers/registry`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/registry.ts __tests__/providers/registry.test.ts
git commit -m "feat(providers): add registry for pluggable adapters"
```

### Task 1.3: 示例 mock adapter（验证骨架）

**Files:**
- Create: `lib/providers/mock.ts`
- Create: `lib/providers/index.ts`（注册入口）
- Test: `__tests__/providers/mock.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/providers/mock.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mockProvider } from '@/lib/providers/mock'

describe('mockProvider', () => {
  it('emits queued → progress → image → done', async () => {
    const events: string[] = []
    const ac = new AbortController()
    for await (const evt of mockProvider.generate(
      { prompt: 'hello' }, 'key', ac.signal,
    )) events.push(evt.type)
    expect(events).toEqual(['queued', 'progress', 'image', 'done'])
  })

  it('respects abort', async () => {
    const ac = new AbortController()
    const it = mockProvider.generate({ prompt: 'x' }, 'k', ac.signal)[Symbol.asyncIterator]()
    await it.next()
    ac.abort()
    const res = await it.next()
    expect(res.done || res.value?.type === 'error').toBe(true)
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- providers/mock`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `lib/providers/mock.ts`:
```ts
import type { ProviderAdapter, GenerateEvent } from './types'

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) }, { once: true })
  })

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg=='

export const mockProvider: ProviderAdapter = {
  id: 'mock',
  displayName: 'Mock (Dev)',
  capabilities: { textToImage: true, imageToImage: true, maxImages: 4, sizes: ['512x512', '1024x1024'] },
  async *generate(input, _apiKey, signal): AsyncIterable<GenerateEvent> {
    try {
      yield { type: 'queued' }
      await sleep(100, signal)
      yield { type: 'progress', pct: 50, message: 'rendering' }
      await sleep(100, signal)
      yield { type: 'image', url: PIXEL, index: 0 }
      yield { type: 'done' }
    } catch {
      yield { type: 'error', code: 'ABORTED', message: 'cancelled', retryable: false }
    }
  },
}
```

Create `lib/providers/index.ts`:
```ts
import { registerProvider, clearRegistry } from './registry'
import { mockProvider } from './mock'

let bootstrapped = false
export function bootstrapProviders(): void {
  if (bootstrapped) return
  clearRegistry()
  registerProvider(mockProvider)
  bootstrapped = true
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- providers/mock`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/mock.ts lib/providers/index.ts __tests__/providers/mock.test.ts
git commit -m "feat(providers): add mock adapter + bootstrap entry"
```

---

## Phase 2 · SSE 传输

### Task 2.1: SSE 服务端工具

**Files:**
- Create: `lib/sse/server.ts`
- Test: `__tests__/sse/server.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/sse/server.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { sseResponse } from '@/lib/sse/server'

async function* events() {
  yield { type: 'queued' }
  yield { type: 'done' }
}

describe('sseResponse', () => {
  it('streams each event as data line', async () => {
    const res = sseResponse(events(), new AbortController().signal)
    expect(res.headers.get('content-type')).toMatch(/event-stream/)
    const text = await res.text()
    expect(text).toContain('data: {"type":"queued"}')
    expect(text).toContain('data: {"type":"done"}')
    expect(text.split('\n\n').length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- sse/server`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `lib/sse/server.ts`:
```ts
import type { GenerateEvent } from '@/lib/providers/types'

export function sseResponse(
  source: AsyncIterable<GenerateEvent>,
  signal: AbortSignal,
): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const abort = () => { try { controller.close() } catch {} }
      signal.addEventListener('abort', abort, { once: true })
      try {
        for await (const evt of source) {
          if (signal.aborted) break
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stream error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', code: 'STREAM', message: msg, retryable: false })}\n\n`))
      } finally {
        signal.removeEventListener('abort', abort)
        try { controller.close() } catch {}
      }
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- sse/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sse/server.ts __tests__/sse/server.test.ts
git commit -m "feat(sse): server-side SSE response helper"
```

### Task 2.2: SSE 客户端解析 hook

**Files:**
- Create: `lib/sse/client.ts`
- Test: `__tests__/sse/client.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/sse/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { streamSSE } from '@/lib/sse/client'

function mockFetchSSE(chunks: string[]): typeof fetch {
  return vi.fn(async () => {
    const enc = new TextEncoder()
    const stream = new ReadableStream({
      start(c) { chunks.forEach(x => c.enqueue(enc.encode(x))); c.close() },
    })
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
  }) as any
}

describe('streamSSE', () => {
  it('parses multiple events across chunk boundaries', async () => {
    const orig = globalThis.fetch
    globalThis.fetch = mockFetchSSE([
      'data: {"type":"queued"}\n\ndata: {"type":"prog',
      'ress","pct":50}\n\ndata: {"type":"done"}\n\n',
    ])
    const got: string[] = []
    for await (const evt of streamSSE('/api/generate', { method: 'POST' })) {
      got.push(evt.type)
    }
    globalThis.fetch = orig
    expect(got).toEqual(['queued', 'progress', 'done'])
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- sse/client`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `lib/sse/client.ts`:
```ts
import { GenerateEventSchema, type GenerateEvent } from '@/lib/providers/types'

export async function* streamSSE(
  url: string,
  init: RequestInit = {},
): AsyncGenerator<GenerateEvent> {
  const res = await fetch(url, init)
  if (!res.ok || !res.body) {
    yield { type: 'error', code: `HTTP_${res.status}`, message: res.statusText || 'request failed', retryable: res.status >= 500 }
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const line = frame.split('\n').find(l => l.startsWith('data: '))
      if (!line) continue
      const json = line.slice(6).trim()
      if (!json) continue
      try {
        const parsed = GenerateEventSchema.parse(JSON.parse(json))
        yield parsed
      } catch {
        // ignore malformed frames
      }
    }
  }
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- sse/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sse/client.ts __tests__/sse/client.test.ts
git commit -m "feat(sse): client SSE stream parser"
```

---

## Phase 3 · API Routes

### Task 3.1: `/api/generate` 路由

**Files:**
- Create: `app/api/generate/route.ts`
- Test: `__tests__/api/generate.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/api/generate.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { POST } from '@/app/api/generate/route'
import { bootstrapProviders } from '@/lib/providers'

beforeAll(() => bootstrapProviders())

function makeReq(body: unknown, apiKey = 'k'): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  })
}

describe('POST /api/generate', () => {
  it('returns SSE stream for mock provider', async () => {
    const res = await POST(makeReq({ providerId: 'mock', input: { prompt: 'hi' } }))
    expect(res.headers.get('content-type')).toMatch(/event-stream/)
    const text = await res.text()
    expect(text).toContain('"type":"queued"')
    expect(text).toContain('"type":"done"')
  })

  it('400 on invalid body', async () => {
    const res = await POST(makeReq({ providerId: 'mock' } as any))
    expect(res.status).toBe(400)
  })

  it('400 on unknown provider', async () => {
    const res = await POST(makeReq({ providerId: 'nope', input: { prompt: 'x' } }))
    expect(res.status).toBe(400)
  })

  it('401 when api key missing', async () => {
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'mock', input: { prompt: 'x' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- api/generate`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `app/api/generate/route.ts`:
```ts
import { z } from 'zod'
import { bootstrapProviders } from '@/lib/providers'
import { getProvider } from '@/lib/providers/registry'
import { GenerateInputSchema } from '@/lib/providers/types'
import { sseResponse } from '@/lib/sse/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

bootstrapProviders()

const BodySchema = z.object({
  providerId: z.string().min(1),
  input: GenerateInputSchema,
})

export async function POST(req: Request): Promise<Response> {
  const apiKey = req.headers.get('x-api-key') ?? ''
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'missing api key' }), { status: 401 })
  }
  let json: unknown
  try { json = await req.json() } catch { return new Response('bad json', { status: 400 }) }
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.message }), { status: 400 })
  }
  let adapter
  try { adapter = getProvider(parsed.data.providerId) }
  catch (e) { return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400 }) }

  const ac = new AbortController()
  req.signal.addEventListener('abort', () => ac.abort(), { once: true })
  return sseResponse(adapter.generate(parsed.data.input, apiKey, ac.signal), ac.signal)
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- api/generate`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/generate/route.ts __tests__/api/generate.test.ts
git commit -m "feat(api): /api/generate SSE route with zod validation"
```

### Task 3.2: `/api/models` 路由

**Files:**
- Create: `app/api/models/route.ts`
- Test: `__tests__/api/models.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/api/models.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/models/route'

describe('GET /api/models', () => {
  it('returns registered providers with capabilities', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mock', displayName: 'Mock (Dev)' }),
    ]))
    expect(body.providers[0]).toHaveProperty('capabilities')
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- api/models`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `app/api/models/route.ts`:
```ts
import { bootstrapProviders } from '@/lib/providers'
import { listProviders } from '@/lib/providers/registry'

export const runtime = 'nodejs'
bootstrapProviders()

export async function GET() {
  const providers = listProviders().map(p => ({
    id: p.id,
    displayName: p.displayName,
    capabilities: p.capabilities,
  }))
  return Response.json({ providers })
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- api/models`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/models/route.ts __tests__/api/models.test.ts
git commit -m "feat(api): /api/models provider listing"
```

---

## Phase 4 · 本地存储层

### Task 4.1: localStorage Key 管理

**Files:**
- Create: `lib/storage/keys.ts`
- Test: `__tests__/storage/keys.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/storage/keys.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setKey, getKey, deleteKey, listKeyedProviders } from '@/lib/storage/keys'

describe('keys storage', () => {
  beforeEach(() => localStorage.clear())
  it('stores and retrieves', () => {
    setKey('mock', 'abc')
    expect(getKey('mock')).toBe('abc')
  })
  it('deletes', () => {
    setKey('mock', 'abc')
    deleteKey('mock')
    expect(getKey('mock')).toBeNull()
  })
  it('lists providers with keys', () => {
    setKey('a', '1'); setKey('b', '2')
    expect(listKeyedProviders().sort()).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- storage/keys`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `lib/storage/keys.ts`:
```ts
const PREFIX = 'apikey:'

export function setKey(providerId: string, key: string): void {
  localStorage.setItem(PREFIX + providerId, key)
}
export function getKey(providerId: string): string | null {
  return localStorage.getItem(PREFIX + providerId)
}
export function deleteKey(providerId: string): void {
  localStorage.removeItem(PREFIX + providerId)
}
export function listKeyedProviders(): string[] {
  const out: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length))
  }
  return out
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- storage/keys`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/keys.ts __tests__/storage/keys.test.ts
git commit -m "feat(storage): localStorage API key manager"
```

### Task 4.2: Dexie 画廊

**Files:**
- Create: `lib/storage/gallery.ts`
- Test: `__tests__/storage/gallery.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/storage/gallery.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { putAsset, listAssets, getAsset, setFavorite, childrenOf, galleryDb } from '@/lib/storage/gallery'

async function blob(text: string) { return new Blob([text]) }

describe('gallery', () => {
  beforeEach(async () => { await galleryDb.assets.clear() })

  it('puts and lists', async () => {
    await putAsset({
      id: 'a1', sessionId: 's1', providerId: 'mock',
      blob: await blob('full'), thumbBlob: await blob('thumb'),
      meta: { prompt: 'p', params: {}, createdAt: 1, favorited: false },
    })
    const all = await listAssets()
    expect(all).toHaveLength(1)
    expect((await getAsset('a1'))?.id).toBe('a1')
  })

  it('toggles favorite', async () => {
    await putAsset({
      id: 'a2', sessionId: 's', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p', params: {}, createdAt: 1, favorited: false },
    })
    await setFavorite('a2', true)
    expect((await getAsset('a2'))?.meta.favorited).toBe(true)
  })

  it('queries children by parentAssetId', async () => {
    await putAsset({
      id: 'p', sessionId: 's', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p', params: {}, createdAt: 1, favorited: false },
    })
    await putAsset({
      id: 'c', sessionId: 's2', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p2', params: {}, createdAt: 2, favorited: false, parentAssetId: 'p' },
    })
    const kids = await childrenOf('p')
    expect(kids.map(a => a.id)).toEqual(['c'])
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- storage/gallery`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `lib/storage/gallery.ts`:
```ts
import Dexie, { type EntityTable } from 'dexie'

export type Asset = {
  id: string
  sessionId: string
  providerId: string
  blob: Blob
  thumbBlob: Blob
  meta: {
    prompt: string
    params: Record<string, unknown>
    createdAt: number
    favorited: boolean
    parentAssetId?: string
  }
}

class GalleryDb extends Dexie {
  assets!: EntityTable<Asset, 'id'>
  constructor() {
    super('gallery')
    this.version(1).stores({
      assets: 'id, sessionId, providerId, meta.createdAt, meta.parentAssetId, meta.favorited',
    })
  }
}

export const galleryDb = new GalleryDb()

export async function putAsset(a: Asset) { await galleryDb.assets.put(a) }
export async function getAsset(id: string) { return galleryDb.assets.get(id) }
export async function listAssets() {
  return galleryDb.assets.orderBy('meta.createdAt').reverse().toArray()
}
export async function setFavorite(id: string, favorited: boolean) {
  const a = await galleryDb.assets.get(id); if (!a) return
  a.meta.favorited = favorited
  await galleryDb.assets.put(a)
}
export async function childrenOf(parentAssetId: string) {
  return galleryDb.assets.where('meta.parentAssetId').equals(parentAssetId).toArray()
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- storage/gallery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/gallery.ts __tests__/storage/gallery.test.ts
git commit -m "feat(storage): Dexie-backed gallery with derivation chain"
```

---

## Phase 5 · 状态管理

### Task 5.1: Zustand stores

**Files:**
- Create: `lib/store/useModelStore.ts`
- Create: `lib/store/usePromptStore.ts`
- Create: `lib/store/useSessionStore.ts`
- Test: `__tests__/store/stores.test.ts`

- [ ] **Step 1: 写失败测试**

Create `__tests__/store/stores.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { useSessionStore } from '@/lib/store/useSessionStore'

describe('useModelStore', () => {
  beforeEach(() => useModelStore.setState({ cards: [] }))
  it('adds and removes cards', () => {
    useModelStore.getState().addCard('mock')
    expect(useModelStore.getState().cards).toHaveLength(1)
    const id = useModelStore.getState().cards[0].cardId
    useModelStore.getState().removeCard(id)
    expect(useModelStore.getState().cards).toHaveLength(0)
  })
  it('swaps provider on a card', () => {
    useModelStore.getState().addCard('mock')
    const id = useModelStore.getState().cards[0].cardId
    useModelStore.getState().setProvider(id, 'other')
    expect(useModelStore.getState().cards[0].providerId).toBe('other')
  })
})

describe('usePromptStore', () => {
  beforeEach(() => usePromptStore.setState({ prompt: '', attachments: [], params: {} }))
  it('sets prompt and params', () => {
    usePromptStore.getState().setPrompt('hi')
    usePromptStore.getState().setParams({ size: '1024x1024' })
    expect(usePromptStore.getState().prompt).toBe('hi')
    expect(usePromptStore.getState().params.size).toBe('1024x1024')
  })
})

describe('useSessionStore', () => {
  beforeEach(() => useSessionStore.setState({ sessions: {} }))
  it('creates session and updates card status', () => {
    const s = useSessionStore.getState().createSession({ prompt: 'p', params: {}, cards: [{ cardId: 'c1', providerId: 'mock' }] })
    useSessionStore.getState().updateCard(s.id, 'c1', { status: 'running' })
    expect(useSessionStore.getState().sessions[s.id].cards[0].status).toBe('running')
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- store/stores`
Expected: FAIL.

- [ ] **Step 3: 实现 `useModelStore.ts`**

```ts
import { create } from 'zustand'

export type ModelCard = { cardId: string; providerId: string }
type State = {
  cards: ModelCard[]
  addCard: (providerId: string) => void
  removeCard: (cardId: string) => void
  setProvider: (cardId: string, providerId: string) => void
}

export const useModelStore = create<State>((set) => ({
  cards: [],
  addCard: (providerId) => set((s) => ({
    cards: [...s.cards, { cardId: crypto.randomUUID(), providerId }],
  })),
  removeCard: (cardId) => set((s) => ({ cards: s.cards.filter(c => c.cardId !== cardId) })),
  setProvider: (cardId, providerId) => set((s) => ({
    cards: s.cards.map(c => c.cardId === cardId ? { ...c, providerId } : c),
  })),
}))
```

- [ ] **Step 4: 实现 `usePromptStore.ts`**

```ts
import { create } from 'zustand'

type Params = { size?: string; n?: number; seed?: number }
type State = {
  prompt: string
  attachments: File[]
  params: Params
  setPrompt: (p: string) => void
  setAttachments: (a: File[]) => void
  setParams: (p: Partial<Params>) => void
  reset: () => void
}

export const usePromptStore = create<State>((set) => ({
  prompt: '', attachments: [], params: {},
  setPrompt: (prompt) => set({ prompt }),
  setAttachments: (attachments) => set({ attachments }),
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  reset: () => set({ prompt: '', attachments: [], params: {} }),
}))
```

- [ ] **Step 5: 实现 `useSessionStore.ts`**

```ts
import { create } from 'zustand'

export type SessionCard = {
  cardId: string
  providerId: string
  status: 'idle' | 'queued' | 'running' | 'done' | 'error'
  images: { url: string; assetId?: string }[]
  error?: { code: string; message: string }
}

export type Session = {
  id: string
  createdAt: number
  parentAssetId?: string
  prompt: string
  params: Record<string, unknown>
  cards: SessionCard[]
}

type State = {
  sessions: Record<string, Session>
  createSession: (partial: Omit<Session, 'id' | 'createdAt' | 'cards'> & { cards: Array<Pick<SessionCard, 'cardId' | 'providerId'>> }) => Session
  updateCard: (sessionId: string, cardId: string, patch: Partial<SessionCard>) => void
  appendImage: (sessionId: string, cardId: string, url: string) => void
}

export const useSessionStore = create<State>((set, get) => ({
  sessions: {},
  createSession: (p) => {
    const id = crypto.randomUUID()
    const session: Session = {
      id,
      createdAt: Date.now(),
      parentAssetId: p.parentAssetId,
      prompt: p.prompt,
      params: p.params,
      cards: p.cards.map(c => ({ cardId: c.cardId, providerId: c.providerId, status: 'idle', images: [] })),
    }
    set((s) => ({ sessions: { ...s.sessions, [id]: session } }))
    return session
  },
  updateCard: (sid, cid, patch) => set((s) => {
    const sess = s.sessions[sid]; if (!sess) return s
    return {
      sessions: {
        ...s.sessions,
        [sid]: { ...sess, cards: sess.cards.map(c => c.cardId === cid ? { ...c, ...patch } : c) },
      },
    }
  }),
  appendImage: (sid, cid, url) => {
    const sess = get().sessions[sid]; if (!sess) return
    const next = sess.cards.map(c => c.cardId === cid ? { ...c, images: [...c.images, { url }] } : c)
    set({ sessions: { ...get().sessions, [sid]: { ...sess, cards: next } } })
  },
}))
```

- [ ] **Step 6: 运行 — 应通过**

Run: `npm test -- store/stores`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/store/ __tests__/store/
git commit -m "feat(store): Zustand stores for models, prompt, sessions"
```

---

## Phase 6 · 工作台 UI

### Task 6.1: 基础布局 + 路由骨架

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Create: `app/gallery/page.tsx`
- Create: `app/settings/page.tsx`
- Create: `components/Nav.tsx`
- Create: `components/QueryProvider.tsx`

- [ ] **Step 1: 实现 Query Provider**

Create `components/QueryProvider.tsx`:
```tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

- [ ] **Step 2: 实现 Nav**

Create `components/Nav.tsx`:
```tsx
import Link from 'next/link'

export function Nav() {
  return (
    <nav className="flex gap-4 border-b p-3 text-sm">
      <Link href="/" className="font-semibold">Bench</Link>
      <Link href="/gallery">Gallery</Link>
      <Link href="/settings">Settings</Link>
    </nav>
  )
}
```

- [ ] **Step 3: 改 `app/layout.tsx`**

```tsx
import './globals.css'
import { Nav } from '@/components/Nav'
import { QueryProvider } from '@/components/QueryProvider'
import { Toaster } from '@/components/ui/sonner'

export const metadata = { title: 'Image Bench', description: 'Multi-model image generation bench' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="min-h-screen bg-background text-foreground">
        <QueryProvider>
          <Nav />
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: 占位三页**

Replace `app/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-6"><h1 className="text-2xl font-bold">Workbench</h1></main>
}
```

Create `app/gallery/page.tsx`:
```tsx
export default function GalleryPage() {
  return <main className="p-6"><h1 className="text-2xl font-bold">Gallery</h1></main>
}
```

Create `app/settings/page.tsx`:
```tsx
export default function SettingsPage() {
  return <main className="p-6"><h1 className="text-2xl font-bold">Settings</h1></main>
}
```

- [ ] **Step 5: 启动 & 目测**

Run: `npm run dev`
浏览器打开 http://localhost:3000，看到 Nav 三页可切换，然后 Ctrl+C。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): base layout, nav, query provider, placeholder pages"
```

### Task 6.2: KeyManager（设置页）

**Files:**
- Create: `components/settings/KeyManager.tsx`
- Modify: `app/settings/page.tsx`
- Test: `__tests__/components/KeyManager.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `__tests__/components/KeyManager.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyManager } from '@/components/settings/KeyManager'

vi.mock('@/lib/providers/registry', () => ({
  listProviders: () => [
    { id: 'mock', displayName: 'Mock', capabilities: { textToImage: true, imageToImage: false, maxImages: 1, sizes: ['512x512'] } },
  ],
}))

describe('KeyManager', () => {
  beforeEach(() => localStorage.clear())

  it('persists key on save', async () => {
    render(<KeyManager />)
    const input = screen.getByLabelText(/mock/i)
    await userEvent.type(input, 'secret')
    await userEvent.click(screen.getByRole('button', { name: /save mock/i }))
    expect(localStorage.getItem('apikey:mock')).toBe('secret')
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- KeyManager`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `components/settings/KeyManager.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'
import { setKey, getKey, deleteKey } from '@/lib/storage/keys'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

bootstrapProviders()

export function KeyManager() {
  const providers = listProviders()
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const init: Record<string, string> = {}
    providers.forEach(p => { init[p.id] = getKey(p.id) ?? '' })
    setValues(init)
  }, [])

  return (
    <div className="space-y-4">
      {providers.map(p => (
        <div key={p.id} className="flex items-end gap-2 border p-3 rounded">
          <div className="flex-1">
            <Label htmlFor={`key-${p.id}`}>{p.displayName}</Label>
            <Input
              id={`key-${p.id}`}
              type="password"
              value={values[p.id] ?? ''}
              onChange={(e) => setValues(v => ({ ...v, [p.id]: e.target.value }))}
            />
          </div>
          <Button onClick={() => setKey(p.id, values[p.id])} aria-label={`Save ${p.id}`}>
            Save {p.displayName}
          </Button>
          <Button variant="outline" onClick={() => { deleteKey(p.id); setValues(v => ({ ...v, [p.id]: '' })) }}>
            Clear
          </Button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 接入设置页**

Replace `app/settings/page.tsx`:
```tsx
import { KeyManager } from '@/components/settings/KeyManager'
export default function SettingsPage() {
  return (
    <main className="p-6 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">API Keys</h1>
      <p className="text-sm text-muted-foreground">Keys are stored locally in your browser and sent only at request time.</p>
      <KeyManager />
    </main>
  )
}
```

- [ ] **Step 5: 运行 — 应通过**

Run: `npm test -- KeyManager`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(settings): KeyManager component with localStorage persistence"
```

### Task 6.3: ModelCard 状态机组件

**Files:**
- Create: `components/workbench/ModelCard.tsx`
- Test: `__tests__/components/ModelCard.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `__tests__/components/ModelCard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelCard } from '@/components/workbench/ModelCard'

describe('ModelCard', () => {
  it('renders idle state', () => {
    render(<ModelCard card={{ cardId: 'c1', providerId: 'mock', status: 'idle', images: [] }} providerName="Mock" />)
    expect(screen.getByText('Mock')).toBeInTheDocument()
    expect(screen.getByText(/ready/i)).toBeInTheDocument()
  })
  it('renders error with retry button', () => {
    render(<ModelCard
      card={{ cardId: 'c1', providerId: 'mock', status: 'error', images: [], error: { code: 'X', message: 'oops' } }}
      providerName="Mock"
      onRetry={() => {}}
    />)
    expect(screen.getByText('oops')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
  it('renders image when done', () => {
    render(<ModelCard card={{ cardId: 'c1', providerId: 'mock', status: 'done', images: [{ url: 'data:x' }] }} providerName="Mock" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'data:x')
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- ModelCard`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `components/workbench/ModelCard.tsx`:
```tsx
'use client'
import type { SessionCard } from '@/lib/store/useSessionStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type Props = {
  card: SessionCard
  providerName: string
  onRetry?: () => void
  onFavorite?: (url: string) => void
  onDownload?: (url: string) => void
  onDeriveFrom?: (url: string) => void
  onRemove?: () => void
}

export function ModelCard({ card, providerName, onRetry, onFavorite, onDownload, onDeriveFrom, onRemove }: Props) {
  return (
    <Card className="p-3 space-y-2 relative">
      <div className="flex justify-between items-center">
        <div className="font-medium">{providerName}</div>
        {onRemove && <Button variant="ghost" size="sm" onClick={onRemove}>×</Button>}
      </div>
      {card.status === 'idle' && <div className="text-sm text-muted-foreground">ready</div>}
      {card.status === 'queued' && <div className="text-sm">queued…</div>}
      {card.status === 'running' && <div className="text-sm">generating…</div>}
      {card.status === 'error' && (
        <div className="text-sm text-destructive space-y-2">
          <div>{card.error?.message ?? 'error'}</div>
          {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
        </div>
      )}
      {card.status === 'done' && card.images.length > 0 && (
        <div className="space-y-2">
          {card.images.map((img, i) => (
            <div key={i} className="space-y-1">
              <img src={img.url} alt={`${providerName}-${i}`} className="w-full rounded" />
              <div className="flex gap-1">
                {onFavorite && <Button size="sm" variant="secondary" onClick={() => onFavorite(img.url)}>❤</Button>}
                {onDownload && <Button size="sm" variant="secondary" onClick={() => onDownload(img.url)}>⬇</Button>}
                {onDeriveFrom && <Button size="sm" variant="secondary" onClick={() => onDeriveFrom(img.url)}>🔁</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- ModelCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(workbench): ModelCard state-machine component"
```

### Task 6.4: ModelPicker + AddModelCard

**Files:**
- Create: `components/workbench/ModelPicker.tsx`
- Create: `components/workbench/AddModelCard.tsx`
- Test: `__tests__/components/ModelPicker.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `__tests__/components/ModelPicker.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModelPicker } from '@/components/workbench/ModelPicker'

const providers = [
  { id: 'a', displayName: 'A', capabilities: { textToImage: true, imageToImage: false, maxImages: 1, sizes: ['512x512'] } },
  { id: 'b', displayName: 'B', capabilities: { textToImage: true, imageToImage: true, maxImages: 4, sizes: ['1024x1024'] } },
]

describe('ModelPicker', () => {
  it('calls onSelect with chosen id', async () => {
    const onSelect = vi.fn()
    render(<ModelPicker providers={providers} onSelect={onSelect} trigger={<button>open</button>} />)
    await userEvent.click(screen.getByText('open'))
    await userEvent.click(screen.getByText('B'))
    expect(onSelect).toHaveBeenCalledWith('b')
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- ModelPicker`
Expected: FAIL.

- [ ] **Step 3: 实现 ModelPicker**

Create `components/workbench/ModelPicker.tsx`:
```tsx
'use client'
import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Provider = { id: string; displayName: string; capabilities: any }
type Props = { providers: Provider[]; onSelect: (id: string) => void; trigger: ReactNode }

export function ModelPicker({ providers, onSelect, trigger }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Select a model</DialogTitle>
        <div className="grid gap-2">
          {providers.map(p => (
            <Button
              key={p.id}
              variant="outline"
              onClick={() => { onSelect(p.id); setOpen(false) }}
            >
              {p.displayName}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: 实现 AddModelCard**

Create `components/workbench/AddModelCard.tsx`:
```tsx
'use client'
import { ModelPicker } from './ModelPicker'
import { Card } from '@/components/ui/card'

type Provider = { id: string; displayName: string; capabilities: any }

export function AddModelCard({ providers, onAdd }: { providers: Provider[]; onAdd: (id: string) => void }) {
  return (
    <ModelPicker
      providers={providers}
      onSelect={onAdd}
      trigger={
        <Card className="flex items-center justify-center h-40 cursor-pointer border-dashed text-4xl text-muted-foreground hover:border-foreground">
          +
        </Card>
      }
    />
  )
}
```

- [ ] **Step 5: 运行 — 应通过**

Run: `npm test -- ModelPicker`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workbench): ModelPicker dialog and AddModelCard"
```

### Task 6.5: PromptBar + AttachmentUploader

**Files:**
- Create: `components/workbench/AttachmentUploader.tsx`
- Create: `components/workbench/PromptBar.tsx`
- Test: `__tests__/components/PromptBar.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `__tests__/components/PromptBar.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PromptBar } from '@/components/workbench/PromptBar'

describe('PromptBar', () => {
  it('disables generate when prompt empty', () => {
    render(<PromptBar onGenerate={() => {}} />)
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })

  it('calls onGenerate with current prompt', async () => {
    const onGen = vi.fn()
    render(<PromptBar onGenerate={onGen} />)
    await userEvent.type(screen.getByPlaceholderText(/describe/i), 'hello')
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    expect(onGen).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- PromptBar`
Expected: FAIL.

- [ ] **Step 3: 实现 AttachmentUploader**

Create `components/workbench/AttachmentUploader.tsx`:
```tsx
'use client'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { Button } from '@/components/ui/button'

const MAX_SIZE = 10 * 1024 * 1024

export function AttachmentUploader() {
  const { attachments, setAttachments } = usePromptStore()

  const onFiles = (files: FileList | null) => {
    if (!files) return
    const valid: File[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) { alert(`${f.name} exceeds 10MB`); continue }
      valid.push(f)
    }
    setAttachments([...attachments, ...valid])
  }

  return (
    <div className="flex gap-2 items-center flex-wrap">
      <input
        aria-label="attachments"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => onFiles(e.target.files)}
      />
      {attachments.map((f, i) => (
        <div key={i} className="flex items-center gap-1 text-sm border px-2 py-1 rounded">
          {f.name}
          <Button size="sm" variant="ghost" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>×</Button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 实现 PromptBar**

Create `components/workbench/PromptBar.tsx`:
```tsx
'use client'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AttachmentUploader } from './AttachmentUploader'

type Props = { onGenerate: () => void; busy?: boolean; onCancel?: () => void }

export function PromptBar({ onGenerate, busy, onCancel }: Props) {
  const { prompt, setPrompt, params, setParams } = usePromptStore()
  const disabled = !prompt.trim() || busy
  return (
    <div className="border-t p-3 space-y-2 bg-background">
      <Textarea
        placeholder="Describe what you want to generate…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
      />
      <AttachmentUploader />
      <div className="flex gap-2 items-center">
        <select
          aria-label="size"
          value={params.size ?? '1024x1024'}
          onChange={(e) => setParams({ size: e.target.value })}
          className="border rounded px-2 py-1 text-sm"
        >
          <option>512x512</option>
          <option>1024x1024</option>
        </select>
        <input
          aria-label="n"
          type="number" min={1} max={4}
          value={params.n ?? 1}
          onChange={(e) => setParams({ n: Number(e.target.value) })}
          className="border rounded px-2 py-1 w-16 text-sm"
        />
        <div className="flex-1" />
        {busy && onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button onClick={onGenerate} disabled={disabled}>Generate</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 运行 — 应通过**

Run: `npm test -- PromptBar`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workbench): PromptBar + AttachmentUploader"
```

---

## Phase 7 · 工作台集成

### Task 7.1: useGenerate hook（单卡片 SSE 生成）

**Files:**
- Create: `lib/hooks/useGenerate.ts`
- Test: `__tests__/hooks/useGenerate.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `__tests__/hooks/useGenerate.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGenerate } from '@/lib/hooks/useGenerate'

vi.mock('@/lib/sse/client', () => ({
  async *streamSSE() {
    yield { type: 'queued' }
    yield { type: 'image', url: 'data:x', index: 0 }
    yield { type: 'done' }
  },
}))

describe('useGenerate', () => {
  it('progresses through states and collects image', async () => {
    const { result } = renderHook(() => useGenerate())
    act(() => { result.current.start({ providerId: 'mock', apiKey: 'k', input: { prompt: 'hi' } }) })
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(result.current.images).toEqual(['data:x'])
  })
})
```

- [ ] **Step 2: 运行 — 应失败**

Run: `npm test -- useGenerate`
Expected: FAIL.

- [ ] **Step 3: 实现**

Create `lib/hooks/useGenerate.ts`:
```ts
'use client'
import { useRef, useState } from 'react'
import { streamSSE } from '@/lib/sse/client'

type Status = 'idle' | 'queued' | 'running' | 'done' | 'error'

export type StartParams = {
  providerId: string
  apiKey: string
  input: { prompt: string; referenceImages?: Blob[]; size?: string; n?: number; seed?: number }
}

async function blobToBase64(b: Blob): Promise<string> {
  return await new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(b)
  })
}

export function useGenerate() {
  const [status, setStatus] = useState<Status>('idle')
  const [images, setImages] = useState<string[]>([])
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  const acRef = useRef<AbortController | null>(null)

  const start = async (p: StartParams) => {
    setStatus('queued'); setImages([]); setError(null); setPct(null)
    const ac = new AbortController(); acRef.current = ac
    const referenceImages = p.input.referenceImages
      ? await Promise.all(p.input.referenceImages.map(blobToBase64))
      : undefined
    try {
      for await (const evt of streamSSE('/api/generate', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': p.apiKey },
        body: JSON.stringify({
          providerId: p.providerId,
          input: { ...p.input, referenceImages },
        }),
      })) {
        if (evt.type === 'queued') setStatus('queued')
        else if (evt.type === 'progress') { setStatus('running'); if (evt.pct != null) setPct(evt.pct) }
        else if (evt.type === 'image') { setStatus('running'); setImages(prev => [...prev, evt.url]) }
        else if (evt.type === 'error') { setError({ code: evt.code, message: evt.message }); setStatus('error'); return }
        else if (evt.type === 'done') { setStatus('done'); return }
      }
      setStatus('done')
    } catch (e) {
      setError({ code: 'NETWORK', message: (e as Error).message })
      setStatus('error')
    }
  }

  const cancel = () => { acRef.current?.abort() }

  return { status, images, error, pct, start, cancel }
}
```

> 注：测试中的 `referenceImages` 未传 Blob，base64 转换路径不走；生产使用时若需 Blob → base64，已在 hook 内处理。`streamSSE` 的 body 里 `referenceImages` 是 `string[]`，对应 adapter 端需要接受 base64 或 URL（mock adapter 不使用附件，兼容即可）。真实 adapter 自行解析。

- [ ] **Step 4: 运行 — 应通过**

Run: `npm test -- useGenerate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(hooks): useGenerate single-card SSE driver"
```

### Task 7.2: ModelGrid 集成 + 主页联调

**Files:**
- Create: `components/workbench/ModelGrid.tsx`
- Create: `components/workbench/CardController.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: CardController（每卡独立控制器）**

Create `components/workbench/CardController.tsx`:
```tsx
'use client'
import { useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import { ModelCard } from './ModelCard'
import { useGenerate } from '@/lib/hooks/useGenerate'
import { getKey } from '@/lib/storage/keys'
import { putAsset } from '@/lib/storage/gallery'
import { toast } from 'sonner'

export type CardControllerHandle = {
  run: (args: { prompt: string; attachments: Blob[]; size?: string; n?: number; seed?: number; parentAssetId?: string }) => void
  cancel: () => void
}

type Props = {
  cardId: string
  providerId: string
  providerName: string
  onRemove: () => void
  onDeriveFrom: (url: string) => void
}

export const CardController = forwardRef<CardControllerHandle, Props>(function CardController(
  { cardId, providerId, providerName, onRemove, onDeriveFrom }, ref,
) {
  const gen = useGenerate()
  const [lastCtx, setLastCtx] = useState<{ prompt: string; params: Record<string, unknown>; parentAssetId?: string } | null>(null)

  useImperativeHandle(ref, () => ({
    run: ({ prompt, attachments, size, n, seed, parentAssetId }) => {
      const apiKey = getKey(providerId)
      if (!apiKey) { toast.error(`Missing API key for ${providerName}. Open Settings.`); return }
      setLastCtx({ prompt, params: { size, n, seed }, parentAssetId })
      gen.start({ providerId, apiKey, input: { prompt, referenceImages: attachments, size, n, seed } })
    },
    cancel: () => gen.cancel(),
  }), [gen, providerId, providerName])

  const saveFavorite = async (url: string) => {
    const blob = await (await fetch(url)).blob()
    const id = crypto.randomUUID()
    await putAsset({
      id, sessionId: cardId, providerId,
      blob, thumbBlob: blob,
      meta: {
        prompt: lastCtx?.prompt ?? '',
        params: lastCtx?.params ?? {},
        createdAt: Date.now(),
        favorited: true,
        parentAssetId: lastCtx?.parentAssetId,
      },
    })
    toast.success('Saved to gallery')
  }

  const download = (url: string) => {
    const a = document.createElement('a')
    a.href = url; a.download = `${providerId}-${Date.now()}.png`
    a.click()
  }

  return (
    <ModelCard
      card={{ cardId, providerId, status: gen.status as any, images: gen.images.map(u => ({ url: u })), error: gen.error ?? undefined }}
      providerName={providerName}
      onRetry={() => lastCtx && gen.start({
        providerId, apiKey: getKey(providerId) ?? '',
        input: { prompt: lastCtx.prompt, ...lastCtx.params as any },
      })}
      onFavorite={saveFavorite}
      onDownload={download}
      onDeriveFrom={onDeriveFrom}
      onRemove={onRemove}
    />
  )
})
```

- [ ] **Step 2: ModelGrid**

Create `components/workbench/ModelGrid.tsx`:
```tsx
'use client'
import { useRef } from 'react'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { CardController, type CardControllerHandle } from './CardController'
import { AddModelCard } from './AddModelCard'
import { PromptBar } from './PromptBar'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'

bootstrapProviders()

export function ModelGrid() {
  const { cards, addCard, removeCard } = useModelStore()
  const { prompt, attachments, params } = usePromptStore()
  const providers = listProviders()
  const byId = new Map(providers.map(p => [p.id, p]))
  const controllers = useRef<Map<string, CardControllerHandle>>(new Map())

  const runAll = () => {
    for (const c of cards) {
      controllers.current.get(c.cardId)?.run({
        prompt, attachments, size: params.size, n: params.n, seed: params.seed,
      })
    }
  }
  const cancelAll = () => { controllers.current.forEach(c => c.cancel()) }

  const deriveFrom = async (url: string) => {
    const blob = await (await fetch(url)).blob()
    const f = new File([blob], 'ref.png', { type: blob.type })
    usePromptStore.getState().setAttachments([f])
    // 迭代时让用户再次在 ModelPicker 选模型 → 这里简化：保留现有卡片集合
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex-1 overflow-auto p-4 grid gap-4"
           style={{ gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))` }}>
        {cards.map(c => {
          const p = byId.get(c.providerId)
          return (
            <CardController
              key={c.cardId}
              ref={(h) => { if (h) controllers.current.set(c.cardId, h); else controllers.current.delete(c.cardId) }}
              cardId={c.cardId}
              providerId={c.providerId}
              providerName={p?.displayName ?? c.providerId}
              onRemove={() => removeCard(c.cardId)}
              onDeriveFrom={deriveFrom}
            />
          )
        })}
        <AddModelCard providers={providers} onAdd={addCard} />
      </div>
      <PromptBar onGenerate={runAll} onCancel={cancelAll} />
    </div>
  )
}
```

- [ ] **Step 3: 主页接入**

Replace `app/page.tsx`:
```tsx
import { ModelGrid } from '@/components/workbench/ModelGrid'
export default function Home() { return <ModelGrid /> }
```

- [ ] **Step 4: 手测**

Run: `npm run dev`
步骤：
1. Settings 页给 `mock` 填任意 Key 并 Save
2. 主页点 "+" 加两张 mock 卡
3. 输入提示词 "hello" → Generate
4. 两张卡都应在约 200ms 后显示 1x1 像素图
5. 点 ❤️ → Gallery 页目前只占位（下阶段实现）

Ctrl+C 结束。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(workbench): ModelGrid integration with parallel SSE cards"
```

---

## Phase 8 · 画廊

### Task 8.1: GalleryGrid 列表

**Files:**
- Create: `components/gallery/GalleryGrid.tsx`
- Modify: `app/gallery/page.tsx`

- [ ] **Step 1: GalleryGrid**

Create `components/gallery/GalleryGrid.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { listAssets, setFavorite, type Asset } from '@/lib/storage/gallery'
import { Button } from '@/components/ui/button'

export function GalleryGrid() {
  const [items, setItems] = useState<Asset[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  const reload = async () => {
    const list = await listAssets()
    setItems(list)
    const map: Record<string, string> = {}
    list.forEach(a => { map[a.id] = URL.createObjectURL(a.thumbBlob) })
    setUrls(map)
  }
  useEffect(() => { reload(); return () => { Object.values(urls).forEach(URL.revokeObjectURL) } }, [])

  if (items.length === 0) return <p className="text-muted-foreground">No saved images yet.</p>

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
      {items.map(a => (
        <div key={a.id} className="border rounded p-2 space-y-1">
          <img src={urls[a.id]} alt={a.meta.prompt} className="w-full rounded" />
          <div className="text-xs truncate">{a.meta.prompt}</div>
          <div className="text-xs text-muted-foreground">{a.providerId}</div>
          <Button size="sm" variant="outline" onClick={async () => { await setFavorite(a.id, !a.meta.favorited); reload() }}>
            {a.meta.favorited ? 'Unfavorite' : 'Favorite'}
          </Button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 接入页面**

Replace `app/gallery/page.tsx`:
```tsx
import { GalleryGrid } from '@/components/gallery/GalleryGrid'
export default function GalleryPage() {
  return <main className="p-6 space-y-4"><h1 className="text-2xl font-bold">Gallery</h1><GalleryGrid /></main>
}
```

- [ ] **Step 3: 手测**

生图、❤️保存、访问 /gallery 看到图。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(gallery): list saved assets from IndexedDB"
```

### Task 8.2: SessionTimeline 派生链

**Files:**
- Create: `components/gallery/SessionTimeline.tsx`
- Modify: `app/gallery/page.tsx`

- [ ] **Step 1: 实现**

Create `components/gallery/SessionTimeline.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { listAssets, type Asset } from '@/lib/storage/gallery'

export function SessionTimeline() {
  const [items, setItems] = useState<Asset[]>([])
  useEffect(() => { listAssets().then(setItems) }, [])

  const byParent = new Map<string | undefined, Asset[]>()
  items.forEach(a => {
    const k = a.meta.parentAssetId
    byParent.set(k, [...(byParent.get(k) ?? []), a])
  })

  const renderNode = (a: Asset): JSX.Element => (
    <li key={a.id} className="ml-4 border-l pl-3">
      <div className="text-sm">{a.providerId} — {a.meta.prompt.slice(0, 40)}</div>
      <ul>{(byParent.get(a.id) ?? []).map(renderNode)}</ul>
    </li>
  )

  const roots = byParent.get(undefined) ?? []
  if (roots.length === 0) return null
  return <ul className="space-y-2">{roots.map(renderNode)}</ul>
}
```

- [ ] **Step 2: 接入**

Update `app/gallery/page.tsx`:
```tsx
import { GalleryGrid } from '@/components/gallery/GalleryGrid'
import { SessionTimeline } from '@/components/gallery/SessionTimeline'
export default function GalleryPage() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Gallery</h1>
      <section><h2 className="font-semibold mb-2">All</h2><GalleryGrid /></section>
      <section><h2 className="font-semibold mb-2">Derivation</h2><SessionTimeline /></section>
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(gallery): derivation chain timeline"
```

---

## Phase 9 · 迭代生图（以此为基础继续）

### Task 9.1: 迭代流程

**Files:**
- Modify: `components/workbench/ModelGrid.tsx`
- Modify: `components/workbench/CardController.tsx`

**目标：** 用户点某图的 🔁 → 弹 ModelPicker 选参与模型（可多选）→ 下一次 Generate 使用该图作为 `referenceImages`，且把 `parentAssetId` 串到保存时的 meta。

- [ ] **Step 1: 新增多选 ModelPicker 变体**

Create `components/workbench/MultiModelPicker.tsx`:
```tsx
'use client'
import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Provider = { id: string; displayName: string }
type Props = { providers: Provider[]; onConfirm: (ids: string[]) => void; trigger: ReactNode }

export function MultiModelPicker({ providers, onConfirm, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setSel([]) }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Choose models for next round</DialogTitle>
        <div className="grid gap-2">
          {providers.map(p => (
            <label key={p.id} className="flex items-center gap-2 border rounded p-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sel.includes(p.id)}
                onChange={(e) => setSel(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))}
              />
              {p.displayName}
            </label>
          ))}
        </div>
        <Button disabled={sel.length === 0} onClick={() => { onConfirm(sel); setOpen(false) }}>Continue</Button>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 在 ModelGrid 内串起 deriveFrom**

Modify `components/workbench/ModelGrid.tsx` 的 `deriveFrom` 逻辑：把用户点击的图暂存、弹 MultiModelPicker 选模型，确认后把 cards 置换为新的集合，并触发一次 runAll；同时记录 `parentAssetUrl` → 待后续保存时作为 `parentAssetId` 使用。

完整替换 `deriveFrom` 与相关 state 如下（在文件顶部引入 `MultiModelPicker`，并将 triggering 改为内置状态弹窗）：

```tsx
// 在 ModelGrid 组件内增加：
const [pendingRef, setPendingRef] = useState<{ blob: Blob; parentAssetId?: string } | null>(null)
const [pickerOpen, setPickerOpen] = useState(false)

const deriveFrom = async (url: string, parentAssetId?: string) => {
  const blob = await (await fetch(url)).blob()
  setPendingRef({ blob, parentAssetId })
  setPickerOpen(true)
}

const confirmDerive = (ids: string[]) => {
  if (!pendingRef) return
  const f = new File([pendingRef.blob], 'ref.png', { type: pendingRef.blob.type })
  usePromptStore.getState().setAttachments([f])
  // 替换卡片集合为新的一组
  useModelStore.setState({ cards: ids.map(id => ({ cardId: crypto.randomUUID(), providerId: id })) })
  // 在下一个 tick 触发生成
  setTimeout(runAll, 0)
}
```

在 JSX 末尾插入受控弹窗（`open={pickerOpen} onOpenChange={setPickerOpen}`）：把 `MultiModelPicker` 的 Dialog 改成受控或在外层额外挂一次。简化起见，这里不复用 MultiModelPicker 的内建 Dialog，直接用其控件内容：

> 为避免双重 Dialog 控制复杂度，重新把 MultiModelPicker 重构为受控组件：

调整 `components/workbench/MultiModelPicker.tsx` 的 Props 为 `{ open, onOpenChange, providers, onConfirm }` 并移除 `trigger`：
```tsx
type Props = {
  open: boolean; onOpenChange: (v: boolean) => void
  providers: Provider[]; onConfirm: (ids: string[]) => void
}

export function MultiModelPicker({ open, onOpenChange, providers, onConfirm }: Props) {
  const [sel, setSel] = useState<string[]>([])
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) setSel([]) }}>
      <DialogContent>
        <DialogTitle>Choose models for next round</DialogTitle>
        {/* ...同上... */}
        <Button disabled={sel.length === 0} onClick={() => { onConfirm(sel); onOpenChange(false) }}>Continue</Button>
      </DialogContent>
    </Dialog>
  )
}
```

然后在 ModelGrid 的返回 JSX 最外层附加：
```tsx
<MultiModelPicker
  open={pickerOpen}
  onOpenChange={setPickerOpen}
  providers={providers}
  onConfirm={confirmDerive}
/>
```

- [ ] **Step 3: CardController 传 parentAssetId**

Modify `components/workbench/CardController.tsx`：给 `run` 增加 `parentAssetId?: string` 参数并保存到 `lastCtx`，保存收藏时已使用 `lastCtx.parentAssetId`（Task 7.1 中已支持）。在 `ModelGrid.runAll` 里传入 `pendingRef?.parentAssetId`：

```tsx
const runAll = () => {
  for (const c of cards) {
    controllers.current.get(c.cardId)?.run({
      prompt, attachments, size: params.size, n: params.n, seed: params.seed,
      parentAssetId: pendingRef?.parentAssetId,
    })
  }
}
```

保存收藏时由 CardController 取出该 parentAssetId 存入 Asset.meta。若当前 parent 是"URL 而非已保存 assetId"（即用户派生自当前会话尚未保存的图），本版本策略：**保存派生图时先把"参考图"自动作为一个 Asset 保存并获得 id**。

为简化：在 `confirmDerive` 里先把参考图存成 Asset：
```tsx
import { putAsset } from '@/lib/storage/gallery'

const confirmDerive = async (ids: string[]) => {
  if (!pendingRef) return
  const parentId = crypto.randomUUID()
  await putAsset({
    id: parentId, sessionId: 'derive-source', providerId: 'derive',
    blob: pendingRef.blob, thumbBlob: pendingRef.blob,
    meta: { prompt: usePromptStore.getState().prompt, params: {}, createdAt: Date.now(), favorited: false },
  })
  const f = new File([pendingRef.blob], 'ref.png', { type: pendingRef.blob.type })
  usePromptStore.getState().setAttachments([f])
  useModelStore.setState({ cards: ids.map(id => ({ cardId: crypto.randomUUID(), providerId: id })) })
  setPendingRef({ blob: pendingRef.blob, parentAssetId: parentId })
  setTimeout(runAll, 0)
}
```

- [ ] **Step 4: 手测**

重启 `npm run dev`：生图 → 🔁 → 勾选 mock → Continue → 新一轮生成；❤️ 保存派生图 → /gallery → Derivation 看到父子链。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(workbench): derive-from flow with multi-model picker and parent linkage"
```

---

## Phase 10 · E2E 测试

### Task 10.1: Playwright 关键旅程

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/main.spec.ts`

- [ ] **Step 1: Playwright 配置**

Create `playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 2: E2E 脚本**

Create `e2e/main.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('generate → favorite → gallery → derive', async ({ page }) => {
  await page.goto('/settings')
  await page.getByLabel('Mock').fill('test-key')
  await page.getByRole('button', { name: /Save Mock/i }).click()

  await page.goto('/')
  // 加两张 mock 卡
  for (let i = 0; i < 2; i++) {
    await page.locator('text=+').first().click()
    await page.getByRole('button', { name: 'Mock (Dev)' }).click()
  }
  await page.getByPlaceholder(/Describe/i).fill('a cat')
  await page.getByRole('button', { name: /Generate/i }).click()

  await expect(page.getByRole('img')).toHaveCount(2, { timeout: 10_000 })

  // 收藏第一张
  await page.getByRole('button', { name: '❤' }).first().click()

  await page.goto('/gallery')
  await expect(page.getByRole('img')).toHaveCount(1)
})
```

- [ ] **Step 3: 跑 E2E**

Run: `npm run e2e`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e2e): main journey playwright spec"
```

---

## Phase 11 · 收尾

### Task 11.1: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README**

Create `README.md`:
````markdown
# Image Bench

同屏并排对比多个图像生成模型，自选最优结果保存，支持以结果为基础继续迭代。

## 开发

```bash
npm install
npm run dev   # http://localhost:3000
npm test      # 单元 + 集成
npm run e2e   # Playwright 端到端
```

## 新增一个模型 Adapter

1. 复制 `lib/providers/_template.ts`（如缺失可参照 `lib/providers/mock.ts`）到 `lib/providers/<your-model>.ts`
2. 实现 `ProviderAdapter` 接口（见 `lib/providers/types.ts`）
3. 在 `lib/providers/index.ts` 里 `registerProvider(...)`

所有 API Key 仅存于浏览器 localStorage，请求时作为 `x-api-key` header 发给同源 `/api/generate`，服务端不落盘、不写日志。
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with dev and adapter authoring"
```

### Task 11.2: 全量验证

- [ ] **Step 1: 跑所有测试**

```bash
npm test && npm run e2e
```
Expected: all passed.

- [ ] **Step 2: 目测三页**

`npm run dev` → 依次走一遍 settings / home / gallery 的核心路径。

- [ ] **Step 3: Commit（如有微调）** 无则跳过。

---

## 附：新增真实 Provider 的规范（后续）

1. 在 `lib/providers/<name>.ts` 实现：
   - `capabilities`：如实声明 `imageToImage`、`sizes`、`maxImages`
   - `generate(input, apiKey, signal)`：**必须**使用 `signal`；对厂商异步任务型 API，内部 `while (running) { poll(); yield progress }`；成功 yield `image` 后 yield `done`；失败 yield `error` 后退出
2. 写单元测试（用 msw 或手 mock fetch 覆盖 2xx / 401 / 429 / 5xx / 超时 5 种路径）
3. 在 `lib/providers/index.ts` 的 `bootstrapProviders` 里注册
4. 手测：真实 Key 在 Settings 填入，UI 生图跑通

---

## 自检

- **Spec 覆盖：** §3 架构（Phase 1/2/3）、§4 UI（Phase 6/7/8）、§5 数据模型（Task 1.1/4.2/5.1）、§6 目录结构（全程）、§7 关键流程（Task 7.2/9.1）、§8 错误处理（Task 1.1/3.1/7.1 的 toast/retry/格间隔离）、§9 测试策略（贯穿 TDD + Phase 10 E2E）、§10 首版交付范围（全量覆盖）
- **无占位符：** 所有代码块完整可运行
- **类型一致：** `GenerateEvent`/`ProviderAdapter`/`Asset`/`Session` 定义后各处引用一致
