import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import zlib from 'node:zlib'

/**
 * Procedurally build a 16x16 solid-black PNG in-memory. Used as the menubar /
 * system tray template icon (macOS inverts template images for dark mode).
 * Avoids shipping a binary asset; the whole PNG is ~80 bytes after deflate.
 */
function buildTemplateIconBuffer(): Buffer {
  const w = 16
  const h = 16
  const bytesPerRow = 1 + w * 4 // 1 filter byte + RGBA pixels
  const raw = Buffer.alloc(h * bytesPerRow)
  for (let y = 0; y < h; y++) {
    const rowOffset = y * bytesPerRow
    raw[rowOffset] = 0 // filter = None
    for (let x = 0; x < w; x++) {
      const px = rowOffset + 1 + x * 4
      raw[px + 0] = 0 // R
      raw[px + 1] = 0 // G
      raw[px + 2] = 0 // B
      raw[px + 3] = 255 // A
    }
  }

  const idat = zlib.deflateSync(raw)

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(6, 9) // RGBA color type
  ihdr.writeUInt8(0, 10) // compression
  ihdr.writeUInt8(0, 11) // filter
  ihdr.writeUInt8(0, 12) // interlace

  return Buffer.concat([
    pngSignature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crc])
}

// Minimal CRC32 (polynomial 0xEDB88320)
let _crcTable: Uint32Array | null = null
function crc32(buf: Buffer): number {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      _crcTable[i] = c
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = _crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

let tray: Tray | null = null

export function installTray(getMainWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray

  const image = nativeImage.createFromBuffer(buildTemplateIconBuffer())
  image.setTemplateImage(true) // macOS dark-mode adaptive
  tray = new Tray(image)
  tray.setToolTip('Parallax')

  const showMain = () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  const rebuildMenu = () => {
    const win = getMainWindow()
    const visible = !!win?.isVisible()
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: visible ? '隐藏主窗口' : '显示主窗口',
          click: () => {
            if (visible && win) win.hide()
            else showMain()
          },
        },
        { type: 'separator' },
        { label: '退出 Parallax', role: 'quit' },
      ]),
    )
  }

  rebuildMenu()

  tray.on('click', showMain)
  tray.on('right-click', rebuildMenu)

  app.on('browser-window-focus', rebuildMenu)
  app.on('browser-window-blur', rebuildMenu)

  return tray
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}
