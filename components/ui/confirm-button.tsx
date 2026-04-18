'use client'
import { ReactNode, useState } from 'react'
import { Button, type ButtonProps } from './button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './alert-dialog'
import { useT } from '@/lib/i18n/useT'

type Props = Omit<ButtonProps, 'onClick'> & {
  children: ReactNode
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
}

export function ConfirmButton({
  children, title, description,
  confirmLabel, cancelLabel, onConfirm, ...btn
}: Props) {
  const [open, setOpen] = useState(false)
  const t = useT()
  return (
    <>
      <Button {...btn} onClick={() => setOpen(true)}>{children}</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title ?? t('confirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>{description ?? t('confirm.desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel ?? t('confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void onConfirm(); setOpen(false) }}>
              {confirmLabel ?? t('confirm.ok')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
