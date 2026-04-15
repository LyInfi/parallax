const PREFIX = 'apikey:'
const CONFIG_PREFIX = 'cfg:'

export function setConfig(providerId: string, fields: Record<string, string>): void {
  localStorage.setItem(CONFIG_PREFIX + providerId, JSON.stringify(fields))
}

export function getConfig(providerId: string): Record<string, string> {
  const raw = localStorage.getItem(CONFIG_PREFIX + providerId)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, string>
  } catch {}
  return {}
}

export function setKey(providerId: string, key: string): void { localStorage.setItem(PREFIX + providerId, key) }
export function getKey(providerId: string): string | null { return localStorage.getItem(PREFIX + providerId) }
export function deleteKey(providerId: string): void { localStorage.removeItem(PREFIX + providerId) }
export function listKeyedProviders(): string[] {
  const out: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length))
  }
  return out
}

export function setCreds(providerId: string, fields: Record<string, string>): void {
  localStorage.setItem(PREFIX + providerId, JSON.stringify(fields))
}

export function getCreds(providerId: string): Record<string, string> | null {
  const raw = localStorage.getItem(PREFIX + providerId)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, string>
  } catch {}
  // legacy: treat raw string as { apiKey: raw }
  return { apiKey: raw }
}
