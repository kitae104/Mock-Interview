import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

interface Props {
  children: ReactNode
  tone?: 'error' | 'info'
  className?: string
}

// 폼 아래 오류 문구, 안내 문구
export default function Alert({ children, tone = 'error', className }: Props) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('text-sm', tone === 'error' ? 'text-destructive' : 'text-muted-foreground', className)}
    >
      {children}
    </p>
  )
}
