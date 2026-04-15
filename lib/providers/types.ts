import { z } from 'zod'

export const CapabilitiesSchema = z.object({
  textToImage: z.boolean(),
  imageToImage: z.boolean(),
  maxImages: z.number().int().positive(),
  sizes: z.array(z.string()).min(1),
  keyFields: z.array(z.string()).optional(), // default ['apiKey']
})
export type Capabilities = z.infer<typeof CapabilitiesSchema>

export function getKeyFields(p: { capabilities: Capabilities }): string[] {
  return p.capabilities.keyFields ?? ['apiKey']
}

export const GenerateInputSchema = z.object({
  prompt: z.string().min(1),
  referenceImages: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
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
  generate(input: GenerateInput, apiKey: string, signal: AbortSignal): AsyncIterable<GenerateEvent>
}

export class GenerateError extends Error {
  constructor(public code: string, message: string, public retryable: boolean = false) {
    super(message)
    this.name = 'GenerateError'
  }
}
