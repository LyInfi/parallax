// lib/providers/custom.ts
import type { ProviderAdapter, GenerateEvent } from './types'
import { GenerateError } from './types'
import { generateViaChat } from './custom/chat'
import { generateViaImages } from './custom/images'
import { normalizeBaseUrl, type Protocol } from './custom/shared'

export const customProvider: ProviderAdapter = {
  id: 'custom',
  displayName: '自定义端点 (OpenAI 兼容)',
  capabilities: {
    textToImage: true,
    imageToImage: true,
    maxImages: 1,
    // Only the `images` protocol forwards SizeSpec to the endpoint; the `chat`
    // protocol leaves aspect/resolution to the model.
    sizes: ['1024x1024', '512x512', '1792x1024', '1024x1792'],
    configFields: [
      {
        id: 'baseUrl',
        label: 'Base URL',
        placeholder: 'https://api.example.com/v1',
        hint: '仅填到 /v1 为止（不要带 /chat/completions 或 /images/generations），如 https://api.siliconflow.cn/v1',
      },
      {
        id: 'model',
        label: '模型名',
        placeholder: '例如 stabilityai/stable-diffusion-3-5-large',
        hint: '由你的端点支持的模型标识',
      },
      {
        id: 'protocol',
        label: '协议',
        type: 'select',
        default: 'chat',
        options: [
          { value: 'chat', label: 'Chat Completions（多模态，如 gemini-image / gpt-image）' },
          { value: 'images', label: 'Images Generations（DALL-E、SD、Flux 等）' },
        ],
      },
    ],
  },

  async *generate(input, apiKey, signal): AsyncIterable<GenerateEvent> {
    const baseUrlRaw = input.providerOverrides?.baseUrl
    const model = input.providerOverrides?.model
    const protocolRaw = input.providerOverrides?.protocol ?? 'chat'

    // `!apiKey` is defense-in-depth — the /api/generate route already rejects with 401.
    if (!baseUrlRaw || !model || !apiKey) {
      yield { type: 'queued' }
      yield { type: 'error', code: 'CONFIG_MISSING', message: '请在设置中填入 Base URL、Model、API Key', retryable: false }
      return
    }
    if (protocolRaw !== 'chat' && protocolRaw !== 'images') {
      yield { type: 'queued' }
      yield { type: 'error', code: 'CONFIG_INVALID', message: `未知协议: ${String(protocolRaw)}`, retryable: false }
      return
    }

    let baseUrl: string
    try {
      baseUrl = normalizeBaseUrl(String(baseUrlRaw))
    } catch (e) {
      yield { type: 'queued' }
      if (e instanceof GenerateError) {
        yield { type: 'error', code: e.code, message: e.message, retryable: e.retryable }
      } else {
        yield { type: 'error', code: 'CONFIG_INVALID', message: (e as Error).message, retryable: false }
      }
      return
    }

    const protocol = protocolRaw as Protocol
    const args = { baseUrl, model: String(model), input, apiKey, signal }
    if (protocol === 'images') {
      yield* generateViaImages(args)
    } else {
      yield* generateViaChat(args)
    }
  },
}
