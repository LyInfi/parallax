import { GalleryGrid } from '@/components/gallery/GalleryGrid'
import { SessionTimeline } from '@/components/gallery/SessionTimeline'
export default function GalleryPage() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Gallery</h1>
      <section><h2 className="font-semibold mb-2">All</h2><GalleryGrid /></section>
      <section><h2 className="font-semibold mb-2">Derivation</h2><SessionTimeline /></section>
    </main>
  )
}
