'use client'
import { ReactNode, useState } from 'react'
import { Button, type ButtonProps } from './button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './alert-dialog'

type Props = Omit<ButtonProps, 'onClick'> & {
  children: ReactNode
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
}

export function ConfirmButton({
  children, title = '确认', description = '此操作不可撤销。',
  confirmLabel = '确定', cancelLabel = '取消', onConfirm, ...btn
}: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button {...btn} onClick={() => setOpen(true)}>{children}</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void onConfirm() }}>
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
