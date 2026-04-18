'use client'
import { GalleryTabs } from '@/components/gallery/GalleryTabs'
import { useT } from '@/lib/i18n/useT'

export default function GalleryPage() {
  const t = useT()
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">{t('gallery.title')}</h1>
      <GalleryTabs />
    </main>
  )
}
