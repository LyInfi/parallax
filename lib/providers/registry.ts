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
export function listProviders(): ProviderAdapter[] { return Array.from(registry.values()) }
export function clearRegistry(): void { registry.clear() }
