'use client'
import type { SessionCard } from '@/lib/store/useSessionStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type Props = {
  card: SessionCard
  providerName: string
  onRetry?: () => void
  onFavorite?: (url: string) => void
  onDownload?: (url: string) => void
  onDeriveFrom?: (url: string) => void
  onRemove?: () => void
}

export function ModelCard({ card, providerName, onRetry, onFavorite, onDownload, onDeriveFrom, onRemove }: Props) {
  return (
    <Card className="p-3 space-y-2 relative">
      <div className="flex justify-between items-center">
        <div className="font-medium">{providerName}</div>
        {onRemove && <Button variant="ghost" size="sm" onClick={onRemove}>×</Button>}
      </div>
      {card.status === 'idle' && <div className="text-sm text-muted-foreground">ready</div>}
      {card.status === 'queued' && <div className="text-sm">queued…</div>}
      {card.status === 'running' && <div className="text-sm">generating…</div>}
      {card.status === 'error' && (
        <div className="text-sm text-destructive space-y-2">
          <div>{card.error?.message ?? 'error'}</div>
          {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
        </div>
      )}
      {card.status === 'done' && card.images.length > 0 && (
        <div className="space-y-2">
          {card.images.map((img, i) => (
            <div key={i} className="space-y-1">
              <img src={img.url} alt={`${providerName}-${i}`} className="w-full rounded" />
              <div className="flex gap-1">
                {onFavorite && <Button size="sm" variant="secondary" onClick={() => onFavorite(img.url)}>❤</Button>}
                {onDownload && <Button size="sm" variant="secondary" onClick={() => onDownload(img.url)}>⬇</Button>}
                {onDeriveFrom && <Button size="sm" variant="secondary" onClick={() => onDeriveFrom(img.url)}>🔁</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
