import type { SizeSpec } from './types'
import { doubaoResolveNative } from './doubao-seedream'
import { jimengResolveNative } from './jimeng-seedream'
import { wanxiangResolveNative } from './wanxiang'
import { googleResolveNative } from './google-nano-banana-2'
import { openrouterResolveNative } from './openrouter'
import { hunyuanResolveNative } from './hunyuan'
import { mockResolveNative } from './mock'

const resolvers: Record<string, (spec: SizeSpec | undefined) => string> = {
  'doubao-seedream': doubaoResolveNative,
  'jimeng-seedream': jimengResolveNative,
  'wanxiang': wanxiangResolveNative,
  'google-nano-banana-2': googleResolveNative,
  'openrouter': openrouterResolveNative,
  'hunyuan': hunyuanResolveNative,
  'mock': mockResolveNative,
}

/**
 * Returns a human-readable size preview string for a given provider and SizeSpec.
 * Used in the UI to show predicted output dimensions per provider.
 */
export function previewSize(providerId: string, spec: SizeSpec | undefined): string {
  const resolver = resolvers[providerId]
  if (!resolver) return '—'
  return resolver(spec)
}
