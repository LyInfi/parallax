'use client'
import type { SessionCard } from '@/lib/store/useSessionStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type Props = {
  card: SessionCard
  providerName: string
  modelName?: string
  onRetry?: () => void
  onFavorite?: (url: string) => void
  onDownload?: (url: string) => void
  onDeriveFrom?: (url: string) => void
  onRemove?: () => void
}

export function ModelCard({ card, providerName, modelName, onRetry, onFavorite, onDownload, onDeriveFrom, onRemove }: Props) {
  return (
    <Card className="p-3 space-y-2 relative">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{providerName}</div>
          {modelName && (
            <div className="text-xs text-muted-foreground truncate" title={modelName}>{modelName}</div>
          )}
        </div>
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
            <div key={i} className="relative group">
              <img
                src={img.url}
                alt={`${providerName}-${i}`}
                className="w-full h-auto max-h-[60vh] object-contain rounded bg-muted"
              />
              <div className="absolute top-1 right-1 flex gap-1 bg-background/80 backdrop-blur rounded p-1 shadow">
                {onFavorite && (
                  <Button size="sm" variant="secondary" title="收藏" onClick={() => onFavorite(img.url)}>❤</Button>
                )}
                {onDownload && (
                  <Button size="sm" variant="secondary" title="下载" onClick={() => onDownload(img.url)}>⬇</Button>
                )}
                {onDeriveFrom && (
                  <Button size="sm" variant="secondary" title="以此为基础继续" onClick={() => onDeriveFrom(img.url)}>🔁</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
