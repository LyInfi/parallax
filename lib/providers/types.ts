import { z } from 'zod'
import { dimensionsFor, inferAspect, inferTier } from './aspect'
import type { Aspect, Tier } from './aspect'

export type { Aspect, Tier }

export const ConfigFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  placeholder: z.string().optional(),
  default: z.string().optional(),
  hint: z.string().optional(),
  type: z.enum(['text', 'select']).optional(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).optional(),
})
export type ConfigField = z.infer<typeof ConfigFieldSchema>

export const CapabilitiesSchema = z.object({
  textToImage: z.boolean(),
  imageToImage: z.boolean(),
  maxImages: z.number().int().positive(),
  sizes: z.array(z.string()).min(1),
  keyFields: z.array(z.string()).optional(), // default ['apiKey']
  configFields: z.array(ConfigFieldSchema).optional(), // maps to providerOverrides
})
export type Capabilities = z.infer<typeof CapabilitiesSchema>

export function getKeyFields(p: { capabilities: Capabilities }): string[] {
  return p.capabilities.keyFields ?? ['apiKey']
}

export function getConfigFields(p: { capabilities: Capabilities }): ConfigField[] {
  return p.capabilities.configFields ?? []
}

export const AspectLiteral = z.enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
export const TierLiteral = z.enum(['standard', 'hd', 'ultra'])

export const SizeSpecSchema = z.union([
  z.string(),
  z.object({ aspect: AspectLiteral, tier: TierLiteral }),
])
export type SizeSpec = z.infer<typeof SizeSpecSchema>

export const GenerateInputSchema = z.object({
  prompt: z.string().min(1),
  referenceImages: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
  size: SizeSpecSchema.optional(),
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
  /** Default model identifier used when the user does not override via config. Shown in UI. */
  defaultModel?: string
  capabilities: Capabilities
  generate(input: GenerateInput, apiKey: string, signal: AbortSignal): AsyncIterable<GenerateEvent>
}

export class GenerateError extends Error {
  constructor(public code: string, message: string, public retryable: boolean = false) {
    super(message)
    this.name = 'GenerateError'
  }
}

export function expectedDimensions(
  spec: SizeSpec | undefined,
  aspectFallback: Aspect = '1:1',
  tierFallback: Tier = 'hd',
): { w: number; h: number; spec: { aspect: Aspect; tier: Tier } } {
  if (typeof spec === 'string') {
    const m = spec.match(/^(\d+)[x*:×](\d+)$/i)
    if (m) {
      const w = +m[1], h = +m[2]
      return { w, h, spec: { aspect: inferAspect(w, h), tier: inferTier(w, h) } }
    }
    return { ...dimensionsFor(aspectFallback, tierFallback), spec: { aspect: aspectFallback, tier: tierFallback } }
  }
  const s = spec ?? { aspect: aspectFallback, tier: tierFallback }
  return { ...dimensionsFor(s.aspect, s.tier), spec: s }
}
