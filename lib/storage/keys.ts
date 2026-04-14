const PREFIX = 'apikey:'
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
