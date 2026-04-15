import Link from 'next/link'
import { AddModelButton } from './AddModelButton'
import { ClearBenchButton } from './ClearBenchButton'

export function Nav() {
  return (
    <nav className="flex items-center gap-4 border-b p-3 text-sm">
      <Link href="/" className="font-semibold">Parallax</Link>
      <Link href="/" className="text-muted-foreground hover:text-foreground">Bench</Link>
      <Link href="/gallery" className="text-muted-foreground hover:text-foreground">Gallery</Link>
      <Link href="/settings" className="text-muted-foreground hover:text-foreground">Settings</Link>
      <div className="flex-1" />
      <ClearBenchButton />
      <AddModelButton />
    </nav>
  )
}
