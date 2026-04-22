import { setCreds, getCreds } from '@/lib/storage/keys'

export type GeminiLoginResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Trigger the Electron-side Gemini login window, capture refreshed cookies,
 * and persist them to localStorage in the same shape the gemini-web provider
 * adapter expects (apikey:gemini-web = JSON {psid, psidts}).
 *
 * Throws if invoked outside the desktop runtime (no window.parallax).
 */
export async function loginGeminiViaElectron(): Promise<GeminiLoginResult> {
  if (typeof window === 'undefined' || !window.parallax?.gemini) {
    return { ok: false, error: 'Desktop bridge unavailable' }
  }
  try {
    const { psid, psidts } = await window.parallax.gemini.login()
    if (!psid || !psidts) {
      return { ok: false, error: 'Login returned without cookies' }
    }
    const existing = getCreds('gemini-web') ?? {}
    setCreds('gemini-web', { ...existing, psid, psidts })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? 'Unknown error' }
  }
}
