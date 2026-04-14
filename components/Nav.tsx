import Link from 'next/link'

export function Nav() {
  return (
    <nav className="flex gap-4 border-b p-3 text-sm">
      <Link href="/" className="font-semibold">Bench</Link>
      <Link href="/gallery">Gallery</Link>
      <Link href="/settings">Settings</Link>
    </nav>
  )
}
