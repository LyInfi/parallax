// True only when running inside the Electron renderer with our preload bridge.
// SSR-safe: returns false on the server (window undefined).
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.parallax?.isDesktop
}
