import { contextBridge, ipcRenderer } from 'electron'

// API surface exposed to the Next.js renderer. Mirror this shape in
// types/electron.d.ts when adding methods.
contextBridge.exposeInMainWorld('parallax', {
  isDesktop: true,
  platform: process.platform,
  appVersion: () => ipcRenderer.invoke('app:version'),
  gemini: {
    login: (): Promise<{ psid: string; psidts: string }> =>
      ipcRenderer.invoke('gemini:login'),
  },
  updater: {
    check: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('updater:check'),
    install: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('updater:install'),
    onEvent: (cb: (evt: unknown) => void) => {
      const listener = (_e: unknown, payload: unknown) => cb(payload)
      ipcRenderer.on('updater:event', listener)
      return () => ipcRenderer.removeListener('updater:event', listener)
    },
  },
})
