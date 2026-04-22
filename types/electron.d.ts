export {}

declare global {
  type UpdaterEvent =
    | { type: 'checking' }
    | { type: 'available'; version: string }
    | { type: 'not-available' }
    | { type: 'downloading'; percent: number }
    | { type: 'downloaded'; version: string }
    | { type: 'error'; message: string }

  interface ParallaxDesktopApi {
    isDesktop: true
    platform: NodeJS.Platform
    appVersion: () => Promise<string>
    gemini: {
      login: () => Promise<{ psid: string; psidts: string }>
    }
    updater: {
      check: () => Promise<{ ok: boolean; error?: string }>
      install: () => Promise<{ ok: boolean }>
      onEvent: (cb: (evt: UpdaterEvent) => void) => () => void
    }
  }

  interface Window {
    parallax?: ParallaxDesktopApi
  }
}
