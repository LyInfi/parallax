import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { findChromeExecutable } from './chrome-locator'

const TARGET_URL = 'https://gemini.google.com/app'
const COOKIE_DOMAIN_URL = 'https://gemini.google.com'
const TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 1500

export interface GeminiCookies {
  psid: string
  psidts: string
}

let pending = false

/**
 * Google blocks embedded browsers (Electron WebView, CEF, etc.) from OAuth
 * flows. Workaround: launch the user's real Chrome with --remote-debugging-port
 * and an isolated temp user-data-dir, let the user sign in there, and pull
 * cookies via CDP. To Google the browser is indistinguishable from a normal
 * fresh Chrome profile.
 */
export function openGeminiAuthWindow(): Promise<GeminiCookies> {
  if (pending) return Promise.reject(new Error('Gemini login already in progress'))
  pending = true

  return (async () => {
    const chromePath = findChromeExecutable()
    if (!chromePath) {
      throw new Error(
        'No Chrome / Chromium install found. Install Google Chrome (recommended) or set PARALLAX_CHROME_PATH to a Chromium-family binary.',
      )
    }

    const port = await findFreePort()
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'parallax-gemini-'))

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-update',
      '--disable-features=ChromeWhatsNewUI',
      '--new-window',
      TARGET_URL,
    ]

    console.log(`[gemini-auth] launching ${chromePath} on debug port ${port}`)
    const chrome = spawn(chromePath, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: false })
    chrome.stdout?.on('data', (c) => process.stdout.write(`[chrome] ${c}`))
    chrome.stderr?.on('data', (c) => process.stderr.write(`[chrome] ${c}`))

    const cleanup = async () => {
      try {
        if (!chrome.killed) chrome.kill('SIGTERM')
      } catch {}
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
    }

    const killIfChildExits = new Promise<never>((_, reject) => {
      chrome.once('exit', (code, signal) => {
        reject(new Error(`Chrome exited before login (code=${code} signal=${signal})`))
      })
    })

    try {
      await Promise.race([waitForDebugPort(port, 15_000), killIfChildExits])
      const cookies = await Promise.race([
        pollCookies(port, TIMEOUT_MS),
        killIfChildExits,
      ])
      await cleanup()
      return cookies
    } catch (err) {
      await cleanup()
      throw err
    } finally {
      pending = false
    }
  })().finally(() => {
    pending = false
  })
}

// ---- helpers ---------------------------------------------------------------

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      server.close(() => resolve(port))
    })
  })
}

async function waitForDebugPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error(`Chrome debug endpoint did not come up on port ${port}`)
}

async function pollCookies(port: number, timeoutMs: number): Promise<GeminiCookies> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const cookies = await fetchGeminiCookies(port)
    const psid = cookies.find((c) => c.name === '__Secure-1PSID' && c.value)?.value
    const psidts = cookies.find((c) => c.name === '__Secure-1PSIDTS' && c.value)?.value
    if (psid && psidts) return { psid, psidts }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('Gemini login timed out — no __Secure-1PSID captured')
}

interface CdpTarget {
  id: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

interface CdpCookie {
  name: string
  value: string
  domain: string
  path: string
}

async function fetchGeminiCookies(port: number): Promise<CdpCookie[]> {
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as CdpTarget[]
  // Prefer a page already on gemini.google.com; fall back to first page target.
  const geminiTarget =
    targets.find((t) => t.type === 'page' && t.url.startsWith('https://gemini.google.com')) ??
    targets.find((t) => t.type === 'page')
  if (!geminiTarget?.webSocketDebuggerUrl) return []
  return sendCdp(geminiTarget.webSocketDebuggerUrl, 'Network.getCookies', {
    urls: [COOKIE_DOMAIN_URL],
  })
    .then((res) => (res?.cookies ?? []) as CdpCookie[])
    .catch(() => [])
}

interface CdpResponse {
  id: number
  result?: { cookies?: CdpCookie[] }
  error?: { code: number; message: string }
}

function sendCdp(
  wsUrl: string,
  method: string,
  params: Record<string, unknown>,
): Promise<{ cookies?: CdpCookie[] }> {
  return new Promise((resolve, reject) => {
    // Node 22+ has a native global WebSocket
    const ws = new WebSocket(wsUrl)
    const id = 1
    const timer = setTimeout(() => {
      try { ws.close() } catch {}
      reject(new Error('CDP request timed out'))
    }, 10_000)

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id, method, params }))
    })
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()) as CdpResponse
        if (msg.id !== id) return
        clearTimeout(timer)
        ws.close()
        if (msg.error) reject(new Error(`CDP error: ${msg.error.message}`))
        else resolve(msg.result ?? {})
      } catch (err) {
        clearTimeout(timer)
        ws.close()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
    ws.addEventListener('error', (err) => {
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error('WebSocket error'))
    })
    ws.addEventListener('close', () => {
      // If we close before resolving, surface it.
      clearTimeout(timer)
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
