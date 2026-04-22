// Next.js `output: standalone` does not copy static or public assets into
// .next/standalone — by design (so they can be served by a CDN). For Electron
// packaging we serve everything from the same Node process, so copy them
// alongside server.js.
//
// Run after `next build`. Idempotent (rm -rf then cp -R semantics).

import { rm, cp, access } from 'node:fs/promises'
import path from 'node:path'

const repo = path.resolve(import.meta.dirname, '..')
const standaloneDir = path.join(repo, '.next', 'standalone')

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

if (!(await exists(standaloneDir))) {
  console.error(`[copy-standalone-assets] missing ${standaloneDir} — run "next build" first`)
  process.exit(1)
}

const tasks = [
  { src: path.join(repo, '.next', 'static'), dest: path.join(standaloneDir, '.next', 'static') },
  { src: path.join(repo, 'public'), dest: path.join(standaloneDir, 'public') },
]

for (const { src, dest } of tasks) {
  if (!(await exists(src))) {
    console.warn(`[copy-standalone-assets] skipping missing source: ${src}`)
    continue
  }
  await rm(dest, { recursive: true, force: true })
  await cp(src, dest, { recursive: true })
  console.log(`[copy-standalone-assets] ${path.relative(repo, src)} -> ${path.relative(repo, dest)}`)
}
