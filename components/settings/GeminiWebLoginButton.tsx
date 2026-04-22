'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isDesktop } from '@/lib/desktop/is-desktop'
import { loginGeminiViaElectron } from '@/lib/desktop/gemini-login'

type Status = 'idle' | 'pending' | 'success' | 'error'

export function GeminiWebLoginButton({ onSuccess }: { onSuccess?: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Avoid SSR / web-version flash: render nothing until we know we're desktop.
  if (!mounted || !isDesktop()) return null

  const handleClick = async () => {
    setStatus('pending')
    setErrorMsg(null)
    const result = await loginGeminiViaElectron()
    if (result.ok) {
      setStatus('success')
      onSuccess?.()
      setTimeout(() => setStatus('idle'), 2500)
    } else {
      setStatus('error')
      setErrorMsg(result.error)
    }
  }

  const label =
    status === 'pending' ? '等待登录…' :
    status === 'success' ? '✓ Cookie 已保存' :
    status === 'error' ? '重试登录' :
    '登录 Gemini（自动获取 Cookie）'

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={status === 'pending'}
        onClick={handleClick}
      >
        {label}
      </Button>
      {status === 'error' && errorMsg && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}
      {status === 'idle' && (
        <p className="text-xs text-muted-foreground">
          桌面端独享：自动启动本机 Chrome 完成登录，全程无需 DevTools。关掉 Chrome 窗口即可，临时 profile 会自动清理。
        </p>
      )}
      {status === 'pending' && (
        <p className="text-xs text-muted-foreground">
          正在启动 Chrome… 请在弹出的 Chrome 窗口完成 Google 登录。
        </p>
      )}
    </div>
  )
}
