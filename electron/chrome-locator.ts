import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

/**
 * Find an installed Chromium-family browser on the local machine. Tries
 * common install paths first (faster, no shell), then falls back to
 * resolving via PATH. Respects PARALLAX_CHROME_PATH for power users.
 */
export function findChromeExecutable(): string | null {
  const envOverride = process.env.PARALLAX_CHROME_PATH
  if (envOverride && existsSync(envOverride)) return envOverride

  const candidates = platformCandidates()
  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  // Last resort: ask the shell. macOS `mdfind` is faster than which for .app
  // bundles but we keep it simple.
  for (const bin of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'brave-browser']) {
    try {
      const out = execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
      if (out && existsSync(out)) return out
    } catch {}
  }
  return null
}

function platformCandidates(): string[] {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]
  }
  if (process.platform === 'win32') {
    const envPaths = [
      process.env.LOCALAPPDATA,
      process.env['ProgramFiles(x86)'],
      process.env.ProgramFiles,
    ].filter(Boolean) as string[]
    const suffixes = [
      'Google\\Chrome\\Application\\chrome.exe',
      'Google\\Chrome Beta\\Application\\chrome.exe',
      'Chromium\\Application\\chrome.exe',
      'Microsoft\\Edge\\Application\\msedge.exe',
      'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ]
    const out: string[] = []
    for (const root of envPaths) for (const s of suffixes) out.push(`${root}\\${s}`)
    return out
  }
  // linux
  return [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/brave-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ]
}
