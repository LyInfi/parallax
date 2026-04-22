import { app } from 'electron'
import { fork, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import type { ProxyEnv } from './proxy-detector'

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

let serverProcess: ChildProcess | null = null

/**
 * Locate the bundled `.next/standalone/server.js`. In dev (electron:dev) it
 * lives at <repo>/.next/standalone/. In a packaged app, electron-builder copies
 * it under resources/app.asar.unpacked/.next/standalone/ (asarUnpack rule).
 */
function resolveServerEntry(): string {
  const isPackaged = app.isPackaged
  if (!isPackaged) {
    return path.join(__dirname, '..', '..', '.next', 'standalone', 'server.js')
  }
  // resourcesPath points at .../Contents/Resources on macOS.
  return path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js')
}

export interface NextServerHandle {
  port: number
  url: string
  stop: () => Promise<void>
}

/**
 * Fork the Next.js standalone server on a free localhost port and resolve once
 * it logs that it's listening. Inherits HTTPS_PROXY etc. into the child env.
 */
export async function startNextServer(proxyEnv: ProxyEnv): Promise<NextServerHandle> {
  const port = await findFreePort()
  const entry = resolveServerEntry()

  const child = fork(entry, {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      ...proxyEnv,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })

  serverProcess = child

  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[next] ${chunk}`)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[next] ${chunk}`)
  })
  child.on('exit', (code, signal) => {
    console.log(`[next] server exited code=${code} signal=${signal}`)
    serverProcess = null
  })

  await waitForReady(child, port)

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    stop: () => stopNextServer(),
  }
}

function waitForReady(child: ChildProcess, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutMs = 30_000
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Next server did not become ready within ${timeoutMs}ms`))
    }, timeoutMs)

    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      // Next 16 prints "Ready in <ms>ms" or "- Local: http://...:PORT" once listening.
      if (text.includes(`:${port}`) || /\bReady\b/i.test(text)) {
        cleanup()
        resolve()
      }
    }

    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`Next server exited prematurely with code ${code}`))
    }

    const cleanup = () => {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.stderr?.off('data', onData)
      child.off('exit', onExit)
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', onExit)
  })
}

export async function stopNextServer(): Promise<void> {
  if (!serverProcess) return
  const proc = serverProcess
  serverProcess = null
  return new Promise<void>((resolve) => {
    proc.once('exit', () => resolve())
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
      resolve()
    }, 3000).unref()
  })
}
