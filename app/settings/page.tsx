'use client'
import { KeyManager } from '@/components/settings/KeyManager'
import { useT } from '@/lib/i18n/useT'

export default function SettingsPage() {
  const t = useT()
  return (
    <main className="p-6 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('settings.blurb')}</p>
      <KeyManager />
    </main>
  )
}
