const PREFIX = 'consent:'

export function hasConsent(providerId: string, version: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(PREFIX + providerId) === version
  } catch {
    return false
  }
}

export function setConsent(providerId: string, version: string): void {
  try {
    localStorage.setItem(PREFIX + providerId, version)
  } catch {}
}

export function clearConsent(providerId: string): void {
  try {
    localStorage.removeItem(PREFIX + providerId)
  } catch {}
}
