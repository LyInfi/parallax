import Link from 'next/link'
import { AddModelButton } from './AddModelButton'

export function Nav() {
  return (
    <nav className="flex items-center gap-4 border-b p-3 text-sm">
      <Link href="/" className="font-semibold">Bench</Link>
      <Link href="/gallery">Gallery</Link>
      <Link href="/settings">Settings</Link>
      <div className="flex-1" />
      <AddModelButton />
    </nav>
  )
}
