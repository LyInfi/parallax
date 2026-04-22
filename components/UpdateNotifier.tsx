'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * Listens for updater events from the Electron main process and surfaces them
 * as toasts. Renders nothing. In web mode (no desktop bridge) this is a no-op.
 */
export function UpdateNotifier() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const api = window.parallax?.updater
    if (!api) return

    const unsubscribe = api.onEvent((evt) => {
      switch (evt.type) {
        case 'available':
          toast.info(`发现新版本 v${evt.version}`, {
            description: '后台下载中…',
            duration: 6000,
          })
          break
        case 'downloading':
          // Throttle: only show at 25/50/75/100 boundaries to avoid spam
          if ([25, 50, 75, 100].includes(evt.percent)) {
            toast.message('下载更新', { description: `${evt.percent}%`, duration: 2000 })
          }
          break
        case 'downloaded':
          toast.success(`v${evt.version} 下载完成`, {
            description: '点击重启安装',
            duration: Infinity,
            action: {
              label: '重启安装',
              onClick: () => {
                void api.install()
              },
            },
          })
          break
        case 'error':
          toast.error('更新检查失败', { description: evt.message, duration: 5000 })
          break
        // 'checking' / 'not-available' intentionally silent
      }
    })
    return unsubscribe
  }, [])
  return null
}
