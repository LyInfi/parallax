'use client'
import Link from 'next/link'
import { AddModelButton } from './AddModelButton'
import { ClearBenchButton } from './ClearBenchButton'
import { LocaleToggle } from './LocaleToggle'
import { useT } from '@/lib/i18n/useT'

export function Nav() {
  const t = useT()
  return (
    <nav className="flex items-center gap-4 border-b p-3 text-sm">
      <Link href="/" className="font-semibold">{t('nav.brand')}</Link>
      <Link href="/" className="text-muted-foreground hover:text-foreground">{t('nav.bench')}</Link>
      <Link href="/gallery" className="text-muted-foreground hover:text-foreground">{t('nav.gallery')}</Link>
      <Link href="/settings" className="text-muted-foreground hover:text-foreground">{t('nav.settings')}</Link>
      <div className="flex-1" />
      <LocaleToggle />
      <ClearBenchButton />
      <AddModelButton />
    </nav>
  )
}
