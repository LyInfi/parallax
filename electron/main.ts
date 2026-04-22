import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { resolveSystemProxy } from './proxy-detector'
import { startNextServer, stopNextServer, type NextServerHandle } from './next-server'
import { openGeminiAuthWindow } from './gemini-auth-window'
import { installTray, destroyTray } from './tray'
import { installUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
let server: NextServerHandle | null = null
let isQuitting = false

async function createMainWindow(targetUrl: string) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Parallax',
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Open external links (target=_blank) in the user's default browser, not
  // inside an unmanaged Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(targetUrl)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  await mainWindow.loadURL(targetUrl)

  // Intercept close: hide to tray unless the user is actually quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('gemini:login', async () => {
  return openGeminiAuthWindow()
})

app.whenReady().then(async () => {
  try {
    const proxyEnv = await resolveSystemProxy()
    server = await startNextServer(proxyEnv)
    await createMainWindow(server.url)
    installTray(() => mainWindow)
    installUpdater(() => mainWindow)
  } catch (err) {
    console.error('[main] failed to launch:', err)
    app.exit(1)
  }
})

// We keep the app alive on all platforms when the main window is hidden —
// background generation needs to keep running. Users quit from the tray menu
// (or Cmd+Q on macOS).
app.on('window-all-closed', () => {
  // no-op; closing the last window hides to tray (see `close` handler above)
})

app.on('activate', async () => {
  if (mainWindow) {
    mainWindow.show()
    return
  }
  if (server) {
    await createMainWindow(server.url)
  }
})

app.on('before-quit', async () => {
  isQuitting = true
  destroyTray()
  await stopNextServer()
})
