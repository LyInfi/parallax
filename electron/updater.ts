import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

let currentWindow: (() => BrowserWindow | null) | null = null

function send(evt: UpdaterEvent) {
  try {
    const win = currentWindow?.()
    if (!win || win.isDestroyed()) return
    win.webContents.send('updater:event', evt)
  } catch {}
}

/**
 * Initialize electron-updater. Unsigned macOS builds cannot install updates
 * (system refuses to replace the binary), but event flow still works so the
 * renderer can show a "new version available" banner with a download link.
 */
export function installUpdater(getWindow: () => BrowserWindow | null) {
  currentWindow = getWindow
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => send({ type: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    send({ type: 'available', version: info.version }),
  )
  autoUpdater.on('update-not-available', () => send({ type: 'not-available' }))
  autoUpdater.on('download-progress', (p) =>
    send({ type: 'downloading', percent: Math.round(p.percent) }),
  )
  autoUpdater.on('update-downloaded', (info) =>
    send({ type: 'downloaded', version: info.version }),
  )
  autoUpdater.on('error', (err) =>
    send({ type: 'error', message: err?.message ?? 'Unknown updater error' }),
  )

  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('updater:install', async () => {
    // Triggers quit + install on the next restart. After this call the
    // downloaded installer replaces the current binary.
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })

  // Don't check in dev mode — electron-updater requires an installed,
  // code-signed build with proper metadata (`app-update.yml`).
  if (!app.isPackaged) {
    console.log('[updater] dev mode — skipping check')
    return
  }

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[updater] initial check failed:', err)
    })
  }, 5000).unref()
}
