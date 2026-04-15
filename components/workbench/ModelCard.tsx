'use client'
import type { SessionCard } from '@/lib/store/useSessionStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Heart, Download, RefreshCw, Replace, X } from 'lucide-react'

type Props = {
  card: SessionCard
  providerName: string
  modelName?: string
  onRetry?: () => void
  onRegenerate?: (url: string) => void
  onFavorite?: (url: string) => void
  onDownload?: (url: string) => void
  onDeriveFrom?: (url: string) => void
  onRemove?: () => void
}

export function ModelCard({ card, providerName, modelName, onRetry, onRegenerate, onFavorite, onDownload, onDeriveFrom, onRemove }: Props) {
  return (
    <Card className="p-3 space-y-2 relative">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{providerName}</div>
          {modelName && (
            <div className="text-xs text-muted-foreground truncate" title={modelName}>{modelName}</div>
          )}
        </div>
        {onRemove && (
          <Button variant="ghost" size="icon" aria-label="移除模型卡" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {card.status === 'idle' && <div className="text-sm text-muted-foreground">就绪</div>}
      {card.status === 'queued' && <div className="text-sm">排队中…</div>}
      {card.status === 'running' && <div className="text-sm">生成中…</div>}
      {card.status === 'error' && (
        <div className="text-sm text-destructive space-y-2">
          <div>{card.error?.message ?? 'error'}</div>
          {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>重试</Button>}
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
                  <Button size="icon" variant="ghost" title="收藏" onClick={() => onFavorite(img.url)}>
                    <Heart className="h-4 w-4" />
                  </Button>
                )}
                {onDownload && (
                  <Button size="icon" variant="ghost" title="下载" onClick={() => onDownload(img.url)}>
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                {onRegenerate && (
                  <Button size="icon" variant="ghost" title="重新生成" onClick={() => onRegenerate(img.url)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                {onDeriveFrom && (
                  <Button size="icon" variant="ghost" title="作为参考图" onClick={() => onDeriveFrom(img.url)}>
                    <Replace className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
